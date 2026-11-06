// Claude-Schritte pro Stelle: bewerten, tailoren, unabhängig reviewen, korrigieren.
const path = require("node:path");
const { renderPrompt, runClaude, SCORE_SCHEMA, TAILOR_SCHEMA, REVIEW_SCHEMA } = require("./claude");
const { appendReview, companyFileFor } = require("./dossier");
const log = require("./log");

const ROOT = path.join(__dirname, "..");

const TAILOR_TOOLS = [
  "Read", "Write", "Edit", "Glob", "Grep",
  "Bash(npm run cv:*)", "Bash(npm run lint:cv)", "Bash(pdftotext:*)", "Bash(pdfinfo:*)",
];
const REVIEW_TOOLS = ["Read", "Glob", "Grep", "Bash(pdftotext:*)", "Bash(pdfinfo:*)"];

const cost = (step) => (step.costUSD ? ` ($${step.costUSD.toFixed(2)})` : "");
const languageLabel = (result) => (result.language === "de" ? "Deutsch (data_de, 2 Seiten)" : "Englisch (data_us, 1 Seite)");
const localeArg = (result) => (result.language === "de" ? " de" : "");
const reviewSummary = (review) => (review.release ? "freigegeben" : `${review.blocking.length} blockierende Funde`);
const withOpenQuestions = (fixed, previous) => ({ ...fixed, openQuestions: [...new Set([...previous.openQuestions, ...fixed.openQuestions])] });

function profileForPrompt() {
  const { summary, experience, skills, education } = require(path.join(ROOT, "private", "data_us"));
  return JSON.stringify({ summary, experience, skills, education }, null, 2);
}

function scoreJob(job, config) {
  return runClaude({
    prompt: renderPrompt("score", {
      profile: profileForPrompt(),
      salaryFloor: config.salaryFloorEUR ? `€${config.salaryFloorEUR.toLocaleString("de-DE")}` : "keine",
      locationPolicy: config.locationPolicy,
      knockoutRules: config.knockoutRules.map((rule) => `- ${rule}\n`).join(""),
      company: job.company,
      title: job.title,
      location: job.location || "keine Angabe",
      salary: job.salary || "keine Angabe",
      url: job.url,
      postedAt: job.postedAt,
      description: job.description ? job.description.slice(0, 20_000) : "(keine Beschreibung im Feed)",
    }),
    model: config.models.score,
    budget: config.budgetUSD.score,
    schema: SCORE_SCHEMA,
    tools: ["WebFetch"],
  });
}

function tailorJob(job, result, config) {
  return runClaude({
    prompt: renderPrompt("tailor", {
      company: job.company,
      companyFile: companyFileFor(job),
      title: job.title,
      location: job.location,
      url: job.url,
      language: languageLabel(result),
      localeArg: localeArg(result),
      slug: job.slug,
      score: result.score,
      breakdown: JSON.stringify(result.breakdown),
      strengths: result.strengths.join("; "),
      gaps: result.gaps.join("; "),
    }),
    model: config.models.tailor,
    budget: config.budgetUSD.tailor,
    schema: TAILOR_SCHEMA,
    permissionMode: "acceptEdits",
    tools: TAILOR_TOOLS,
  });
}

function reviewCv(job, result, tailor, config) {
  return runClaude({
    prompt: renderPrompt("review", {
      company: job.company,
      title: job.title,
      pdfPath: tailor.pdfPath,
      slug: job.slug,
      language: languageLabel(result),
      location: job.location || "keine Angabe",
    }),
    agent: "cv-reviewer",
    model: config.models.review,
    budget: config.budgetUSD.review,
    schema: REVIEW_SCHEMA,
    tools: REVIEW_TOOLS,
  });
}

// `knownQuestions`, damit die Korrektur nur neue offene Fragen liefert statt die bekannten zu wiederholen.
function fixCv(job, result, review, knownQuestions, config) {
  return runClaude({
    prompt: renderPrompt("fix", {
      company: job.company,
      title: job.title,
      slug: job.slug,
      companyFile: companyFileFor(job),
      localeArg: localeArg(result),
      blocking: review.blocking.map((b) => `- ${b.where}: ${b.issue} → ${b.fix}`).join("\n"),
      review: review.review.filter((r) => r.verdict !== "behalten").map((r) => `- ${r.where} (${r.verdict}): ${r.note}`).join("\n") || "keine",
      knownQuestions: knownQuestions.map((q) => `- ${q}`).join("\n") || "keine",
    }),
    model: config.models.tailor,
    budget: config.budgetUSD.tailor,
    schema: TAILOR_SCHEMA,
    permissionMode: "acceptEdits",
    tools: TAILOR_TOOLS,
  });
}

// Scheitert das Tailoring an Seitenzahl oder Lint, bekommt es eine Korrekturrunde wie nach einem Review.
function rescueFailed(job, result, tailor, config) {
  const pseudoReview = {
    blocking: [{ where: "Build", issue: tailor.notes, fix: "Seitenzahl und Lint mit den erlaubten Mitteln herstellen" }],
    review: [],
  };
  const fixed = fixCv(job, result, pseudoReview, tailor.openQuestions, config);
  log(`→ Rettungsrunde ${fixed.status}${cost(fixed)}`);
  return fixed.status === "ready" ? withOpenQuestions(fixed, tailor) : tailor;
}

// Unabhängiger Review mit frischem Kontext. Ohne Freigabe kein Anhang.
// Zwei Korrekturrunden: Am 03.11.2026 deckte die erste Korrektur einen neuen, ebenso kleinen Fund auf.
function reviewAndFix(job, result, tailor, config) {
  let review = reviewCv(job, result, tailor, config);
  log(`→ Review: ${reviewSummary(review)}${cost(review)}`);
  for (let round = 1; !review.release && round <= config.maxFixRounds; round += 1) {
    const fixed = fixCv(job, result, review, tailor.openQuestions, config);
    log(`→ Korrektur ${round} ${fixed.status}${cost(fixed)}`);
    if (fixed.status !== "ready") break;
    tailor = withOpenQuestions(fixed, tailor);
    review = reviewCv(job, result, tailor, config);
    log(`→ Review ${round + 1}: ${reviewSummary(review)}${cost(review)}`);
  }
  if (!review.release) tailor = { ...tailor, status: "blocked" };
  return { tailor, review };
}

// Tailoring mit Rettungsrunde, dann Review mit Korrekturrunden. Wirft nie: Fehler landen im Status.
// Status: ready (freigegeben), failed, blocked (Review ohne Freigabe), unreviewed (Review abgestürzt).
function tailorAndReview(job, result, config) {
  let tailor;
  try {
    tailor = tailorJob(job, result, config);
  } catch (error) {
    tailor = { status: "failed", pdfPath: "", changes: "", openQuestions: [], notes: error.message.slice(0, 300), crashed: true };
  }
  log(`→ Tailoring ${tailor.status}${cost(tailor)}`);

  if (tailor.status === "failed" && !tailor.crashed) {
    try {
      tailor = rescueFailed(job, result, tailor, config);
    } catch (error) {
      log(`⚠ Rettungsrunde fehlgeschlagen für ${job.company}: ${error.message}`);
    }
  }

  let review = null;
  if (tailor.status === "ready") {
    try {
      ({ tailor, review } = reviewAndFix(job, result, tailor, config));
      appendReview(job.slug, review);
    } catch (error) {
      log(`⚠ Review fehlgeschlagen für ${job.company}: ${error.message}`);
      tailor = { ...tailor, status: "unreviewed", notes: `Review abgestürzt: ${error.message.slice(0, 200)}` };
    }
  }
  return { tailor, review };
}

module.exports = { scoreJob, tailorAndReview };

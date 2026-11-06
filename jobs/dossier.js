// Akte pro Treffer: applications/<slug>/job.md und der Dateiname des CV.
const fs = require("node:fs");
const path = require("node:path");

const APPLICATIONS_DIR = path.join(__dirname, "..", "applications");

const today = () => new Date().toISOString().slice(0, 10);
const listItems = (items) => items.map((item) => `  - ${item}`).join("\n");

function slugify(value) {
  return value
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/\((m|w|d|f|x|all genders?)[^)]*\)/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40)
    .replace(/-+$/, "");
}

function writeJobFile(job, result) {
  const dir = path.join(APPLICATIONS_DIR, job.slug);
  fs.mkdirSync(dir, { recursive: true });
  const b = result.breakdown;
  const content = `# ${job.company} · ${job.title}

## Stelle
- Unternehmen: ${job.company}
- Rolle: ${job.title}
- Standort: ${job.location || "keine Angabe"}
- Gehaltsband: ${job.salary || "keine Angabe"}
- Link: ${job.url}
- Live verifiziert am: ${result.liveVerified ? `${today()} (${job.source})` : "nicht verifiziert"}
- Status: Offen
- Gefunden vom Job-Scanner: ${new Date().toISOString().slice(0, 16).replace("T", " ")}

## Stellenbeschreibung
${result.jobText}

## Match-Analyse
- Match: ${result.score} % (Rolle ${b.role}/40, Skills ${b.skills}/60)
- Stärken:
${listItems(result.strengths)}
- Lücken (ehrlich, mit Interview-Antwort):
${listItems(result.gaps)}
${result.knockouts.length ? `- Knockouts:\n${listItems(result.knockouts)}\n` : ""}- Empfehlung: ${result.verdict}

## CV

## Kommunikation

## Notizen & Feedback
`;
  fs.writeFileSync(path.join(dir, "job.md"), content);
}

function appendReview(slug, review) {
  const lines = [
    "",
    `## Unabhängiger Review (${today()})`,
    `- Freigabe: ${review.release ? "ja" : "nein"}`,
    ...review.blocking.map((b) => `- Blockierend · ${b.where}: ${b.issue} → ${b.fix}`),
    ...review.review.map((r) => `- ${r.where}: ${r.verdict}. ${r.note}`),
    ...review.openQuestions.map((q) => `- Offene Frage: ${q}`),
    "",
  ];
  fs.appendFileSync(path.join(APPLICATIONS_DIR, slug, "job.md"), lines.join("\n"));
}

// Mehrere Stellen derselben Firma bekommen den Rollentitel in den Dateinamen, sonst überschreiben sich die PDFs.
function companyFileFor(job) {
  const companySlug = slugify(job.company);
  const siblings = fs.readdirSync(APPLICATIONS_DIR)
    .filter((dir) => dir !== job.slug && dir.startsWith(`${companySlug}-`));
  const fileLabel = siblings.length ? `${job.company} ${job.title.replace(/\(.*?\)/g, "").split(/[-–,]/)[0]}` : job.company;
  return fileLabel.replace(/[^\p{L}\p{N} ]/gu, "").trim().replace(/\s+/g, "_");
}

module.exports = { slugify, writeJobFile, appendReview, companyFileFor };

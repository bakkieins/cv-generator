// Einstiegspunkt des Job-Scanners (launchd oder von Hand, Optionen in jobs/README.md).
const fs = require("node:fs");
const path = require("node:path");
const { fetchSource, loadDescription } = require("./sources");
const { sendMail } = require("./mail");
const { prefilter, matchesCompany, passesTitle, passesLocation, titleKey } = require("./filter");
const { readAlerts, snippetExclusion } = require("./alerts");
const { scoreJob, tailorAndReview } = require("./pipeline");
const { slugify, writeJobFile } = require("./dossier");
const { matchMail, statusMail } = require("./report");
const log = require("./log");

const ROOT = path.join(__dirname, "..");
const STATE_DIR = path.join(ROOT, "private", "jobs-state");
const SEEN_PATH = path.join(STATE_DIR, "seen.json");
const SCORES_PATH = path.join(STATE_DIR, "scores.jsonl");
const LOCK_PATH = path.join(STATE_DIR, "scan.lock");
const LAST_ERROR_MAIL_PATH = path.join(STATE_DIR, "last-error-mail");
const LAST_MAIL_PATH = path.join(STATE_DIR, "last-mail");

const args = process.argv.slice(2);
const option = (name) => args.find((arg) => arg.startsWith(`--${name}=`))?.split("=")[1];
const DRY_RUN = args.includes("--dry-run");
const NO_MAIL = args.includes("--no-mail");
// Nur bewerten und ausgeben, kein Tailoring, kein Mail, State bleibt unverändert.
const SCORE_ONLY = args.includes("--score-only");
const LIMIT = Number(option("limit")) || null;

function loadConfig() {
  const config = { ...require("./jobs.config") };
  const privatePath = path.join(ROOT, "private", "jobs.config.js");
  if (fs.existsSync(privatePath)) Object.assign(config, require(privatePath));
  if (option("threshold")) config.threshold = Number(option("threshold"));
  config.excludeCompanies = [...config.excludeCompanies, ...rejectedFromLocalNotes()];
  return config;
}

// Einzige Quelle für verworfene Firmen bleibt CLAUDE.local.md.
function rejectedFromLocalNotes() {
  const notesPath = path.join(ROOT, "CLAUDE.local.md");
  if (!fs.existsSync(notesPath)) return [];
  const section = fs.readFileSync(notesPath, "utf8").split(/^## Geprüft und verworfen.*$/m)[1];
  if (!section) return [];
  const body = section.split(/^## /m)[0];
  return body.replace(/\(.*?\)/g, "").split(/[,\n]/).map((s) => s.trim().replace(/\.$/, "")).filter(Boolean);
}

function readJson(file, fallback) {
  return fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, "utf8")) : fallback;
}

function acquireLock() {
  if (fs.existsSync(LOCK_PATH)) {
    const pid = Number(fs.readFileSync(LOCK_PATH, "utf8"));
    try {
      process.kill(pid, 0);
      return false;
    } catch {
      // Verwaister Lock eines abgestürzten Laufs.
    }
  }
  fs.writeFileSync(LOCK_PATH, String(process.pid));
  return true;
}

function releaseLock() {
  if (fs.existsSync(LOCK_PATH) && fs.readFileSync(LOCK_PATH, "utf8") === String(process.pid)) {
    fs.rmSync(LOCK_PATH);
  }
}

async function fetchAll(sources) {
  const fetched = await Promise.allSettled(sources.map(fetchSource));
  return fetched.flatMap((outcome, index) => {
    const source = sources[index];
    if (outcome.status === "fulfilled") {
      return outcome.value.map((job) => ({ ...job, focus: Boolean(source.focus) }));
    }
    log(`⚠ Quelle ${[source.ats, source.slug ?? source.query].filter(Boolean).join(":")} fehlgeschlagen: ${outcome.reason.message}`);
    return [];
  });
}

async function main() {
  fs.mkdirSync(STATE_DIR, { recursive: true });
  if (!DRY_RUN && !acquireLock()) {
    log("Vorheriger Lauf läuft noch, überspringe.");
    return;
  }

  const config = loadConfig();
  if (args.includes("--test-mail")) {
    sendMail(config.mail, { subject: "Job-Scanner: Testmail", text: "Mailversand funktioniert.\n" }, STATE_DIR);
    log("Testmail verschickt.");
    return;
  }
  const seen = readJson(SEEN_PATH, {});
  const alerts = await readAlertsSafely(config);
  const { unique, candidates } = prefilter([...(await fetchAll(config.sources)), ...alerts.jobs], config, seen);
  log(`${unique.length} Stellen geladen, ${candidates.length} neue Kandidaten nach Vorfilter.`);
  const toCheck = alertsToCheck(alerts.unresolved, config, seen);
  if (alerts.mails) {
    log(`Alert-Mails: ${alerts.mails}, davon ${alerts.jobs.length} Stellen auf Karriereseiten gefunden, ${toCheck.length} zum Selbstprüfen.`);
  }

  if (DRY_RUN) {
    for (const job of candidates) console.log(`- ${job.company} · ${job.title} · ${job.location} · ${job.url}`);
    for (const entry of toCheck) console.log(`? ${entry.company} · ${entry.title} · ${entry.location} · ${entry.url}`);
    return;
  }

  const matches = [];
  for (const raw of candidates.slice(0, LIMIT ?? config.maxScoresPerRun)) {
    let job;
    let result;
    try {
      job = await loadDescription(raw);
      result = scoreJob(job, config);
    } catch (error) {
      log(`⚠ Bewertung fehlgeschlagen für ${raw.company} · ${raw.title}: ${error.message}`);
      continue;
    }

    const record = { key: job.key, titleKey: job.titleKey, company: job.company, title: job.title, url: job.url, score: result.score, at: new Date().toISOString() };
    log(`${result.score} · ${job.company} · ${job.title}`);
    if (SCORE_ONLY) {
      console.log(JSON.stringify({ ...result, jobText: `${result.jobText.slice(0, 200)}…` }, null, 2));
      continue;
    }
    fs.appendFileSync(SCORES_PATH, `${JSON.stringify({ ...record, breakdown: result.breakdown, verdict: result.verdict, costUSD: result.costUSD })}\n`);

    if (result.score < config.threshold) {
      seen[job.key] = record;
      continue;
    }
    // Über der Schwelle, aber Tailoring-Limit erreicht: nicht als gesehen markieren, nächster Lauf.
    if (matches.length >= config.maxTailorsPerRun) continue;

    job.slug = slugify(`${job.company}-${job.title}`);
    writeJobFile(job, result);
    const { tailor, review } = tailorAndReview(job, result, config);
    seen[job.key] = { ...record, slug: job.slug, tailor: tailor.status };
    matches.push({ job, result, tailor, review, flagged: matchesCompany(job.company, config.flagCompanies) });
    log(`→ Ergebnis ${tailor.status}: ${tailor.pdfPath || tailor.notes}`);
  }

  if (SCORE_ONLY) return;
  // Ohne Mail bleiben Alert-Mails ungelesen, damit ihre Liste im nächsten Lauf nicht verloren ist.
  const mailing = config.mail && !NO_MAIL;
  if (mailing) {
    for (const entry of alerts.unresolved) seen[alertKey(entry)] = { key: alertKey(entry), titleKey: titleKey(entry), company: entry.company, title: entry.title, url: entry.url, at: new Date().toISOString() };
  }
  fs.writeFileSync(SEEN_PATH, JSON.stringify(seen, null, 2));
  if (!mailing) return;

  sendRunMail({ matches, toCheck, loaded: unique.length, candidates: candidates.length, config });
  alerts.commit();
}

function sendRunMail({ matches, toCheck, loaded, candidates, config }) {
  const lastMail = fs.existsSync(LAST_MAIL_PATH) ? Number(fs.readFileSync(LAST_MAIL_PATH, "utf8")) : Date.now() - 24 * 60 * 60 * 1000;
  if (matches.length) {
    sendMail(config.mail, matchMail(matches, toCheck), STATE_DIR);
    log(`Mail mit ${matches.length} Treffer(n) verschickt.`);
  } else if (toCheck.length || new Date(lastMail).toDateString() !== new Date().toDateString()) {
    // Erster Lauf des Tages ohne Treffer: Lebenszeichen statt Funkstille.
    // Stellen über der Schwelle waren schon in einer Treffer-Mail oder kommen im nächsten Lauf.
    const scored = readScoresSince(lastMail).filter((record) => record.score < config.threshold);
    sendMail(config.mail, statusMail({ loaded, candidates, scored, threshold: config.threshold, alerts: toCheck }), STATE_DIR);
    log(`Statusmail verschickt (${scored.length} bewertet seit der letzten Mail, ${toCheck.length} zum Selbstprüfen).`);
  } else {
    return;
  }
  fs.writeFileSync(LAST_MAIL_PATH, String(Date.now()));
}

const NO_ALERTS = { mails: 0, jobs: [], unresolved: [], commit() {} };

// Ein kaputtes Postfach darf den Lauf nicht stoppen, wie eine ausgefallene Quelle.
async function readAlertsSafely(config) {
  if (!config.alerts || !config.mail) return NO_ALERTS;
  try {
    return await readAlerts(config, STATE_DIR);
  } catch (error) {
    log(`⚠ Alert-Mails nicht gelesen: ${error.message}`);
    return NO_ALERTS;
  }
}

const alertKey = (entry) => `${entry.via}:${titleKey(entry)}`;

// Gleiche Regeln wie der Vorfilter, dazu klare Ausschlüsse aus den Angaben der Alert-Mail.
function alertsToCheck(entries, config, seen) {
  const seenTitles = new Set(Object.values(seen).map((record) => record.titleKey));
  return entries.filter((entry) => {
    if (seen[alertKey(entry)] || seenTitles.has(titleKey(entry))) return false;
    if (!passesTitle(entry.title, config) || !passesLocation(entry.location, config)) return false;
    if (matchesCompany(entry.company, config.excludeCompanies)) return false;
    const reason = snippetExclusion(entry, config);
    if (reason) log(`  aussortiert: ${entry.company} · ${entry.title} (${reason})`);
    return !reason;
  });
}

function readScoresSince(time) {
  if (!fs.existsSync(SCORES_PATH)) return [];
  return fs.readFileSync(SCORES_PATH, "utf8").split("\n").filter(Boolean)
    .map((line) => JSON.parse(line))
    .filter((record) => Date.parse(record.at) > time);
}

// Höchstens eine Fehler-Mail pro Tag, damit ein dauerhaft kaputter Feed nicht dreimal täglich mailt.
function errorMail(error) {
  const config = loadConfig();
  const last = fs.existsSync(LAST_ERROR_MAIL_PATH) ? Number(fs.readFileSync(LAST_ERROR_MAIL_PATH, "utf8")) : 0;
  if (!config.mail || NO_MAIL || DRY_RUN || Date.now() - last < 24 * 60 * 60 * 1000) return;
  sendMail(config.mail, { subject: "Job-Scanner: Lauf fehlgeschlagen", text: `${error.stack}\n` }, STATE_DIR);
  fs.writeFileSync(LAST_ERROR_MAIL_PATH, String(Date.now()));
}

main()
  .catch((error) => {
    log(`✗ ${error.stack}`);
    process.exitCode = 1;
    try {
      errorMail(error);
    } catch (mailError) {
      log(`✗ Fehler-Mail fehlgeschlagen: ${mailError.message}`);
    }
  })
  .finally(() => {
    if (!DRY_RUN) releaseLock();
  });

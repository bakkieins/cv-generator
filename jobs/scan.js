// Einstiegspunkt des Job-Scanners (launchd oder von Hand, Optionen in jobs/README.md).
const fs = require("node:fs");
const path = require("node:path");
const { fetchSource, loadDescription } = require("./sources");
const { sendMail } = require("./mail");
const { prefilter, matchesCompany, passesTitle, passesLocation, titleKey } = require("./filter");
const { readAlerts, snippetExclusion } = require("./alerts");
const { readReplies, pickJobs } = require("./replies");
const { scoreJob, tailorAndReview } = require("./pipeline");
const { slugify, writeJobFile } = require("./dossier");
const { matchMail, statusMail, requestMail } = require("./report");
const log = require("./log");

const ROOT = path.join(__dirname, "..");
const STATE_DIR = path.join(ROOT, "private", "jobs-state");
const SEEN_PATH = path.join(STATE_DIR, "seen.json");
const SCORES_PATH = path.join(STATE_DIR, "scores.jsonl");
const LOCK_PATH = path.join(STATE_DIR, "scan.lock");
const LAST_ERROR_MAIL_PATH = path.join(STATE_DIR, "last-error-mail");
const LAST_MAIL_PATH = path.join(STATE_DIR, "last-mail");
// Nummern (J12) der Stellen in den Mails, Warteschlange der per Antwort angeforderten CVs.
const REQUESTS_PATH = path.join(STATE_DIR, "requests.json");
// Bewertete Stellen samt Score-Ergebnis, damit ein angeforderter CV ohne erneute Bewertung entsteht.
const CANDIDATES_PATH = path.join(STATE_DIR, "candidates.json");
const KEEP_DAYS = 60;

const args = process.argv.slice(2);
const option = (name) => args.find((arg) => arg.startsWith(`--${name}=`))?.split("=")[1];
const DRY_RUN = args.includes("--dry-run");
const NO_MAIL = args.includes("--no-mail");
// Nur bewerten und ausgeben, kein Tailoring, kein Mail, State bleibt unverändert.
const SCORE_ONLY = args.includes("--score-only");
// Nur Antworten auf Scanner-Mails abarbeiten (eigener, häufiger LaunchAgent).
const REPLIES_ONLY = args.includes("--replies");
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

const writeJson = (file, value) => fs.writeFileSync(file, JSON.stringify(value, null, 2));
const recent = (record) => Date.now() - Date.parse(record.at) < KEEP_DAYS * 24 * 60 * 60 * 1000;
const keepRecent = (map) => Object.fromEntries(Object.entries(map).filter(([, record]) => recent(record)));

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

// Geplante Läufe warten, statt auszufallen, wenn gerade angeforderte CVs entstehen.
async function waitForLock(maxMinutes) {
  for (let waited = 0; !acquireLock(); waited += 0.5) {
    if (waited >= maxMinutes) return false;
    await new Promise((resolve) => setTimeout(resolve, 30_000));
  }
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
  if (!DRY_RUN && !(REPLIES_ONLY ? acquireLock() : await waitForLock(60))) {
    if (!REPLIES_ONLY) log("Vorheriger Lauf läuft noch, überspringe.");
    return;
  }

  const config = loadConfig();
  if (args.includes("--test-mail")) {
    sendMail(config.mail, { subject: "Job-Scanner: Testmail", text: "Mailversand funktioniert.\n" }, STATE_DIR);
    log("Testmail verschickt.");
    return;
  }
  const seen = readJson(SEEN_PATH, {});
  const candidatesStore = readJson(CANDIDATES_PATH, {});
  if (!DRY_RUN && !SCORE_ONLY) handleReplies(config, seen, candidatesStore);
  if (REPLIES_ONLY) return;
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
    const { key, company, title, location, salary, url, source, postedAt } = job;
    candidatesStore[job.key] = { job: { key, company, title, location, salary, url, source, postedAt }, result, at: record.at };

    if (result.score < config.threshold) {
      seen[job.key] = record;
      continue;
    }
    // Über der Schwelle, aber Tailoring-Limit erreicht: nicht als gesehen markieren, nächster Lauf.
    if (matches.length >= config.maxTailorsPerRun) continue;

    job.slug = slugify(`${job.company}-${job.title}`);
    writeJobFile(job, result);
    const { tailor, review } = tailorAndReview(job, result, config);
    seen[job.key] = { ...record, slug: job.slug, tailor: tailor.status, ...(tailor.status === "ready" ? { pdf: tailor.pdfPath } : {}) };
    matches.push({ job, result, tailor, review, flagged: matchesCompany(job.company, config.flagCompanies) });
    log(`→ Ergebnis ${tailor.status}: ${tailor.pdfPath || tailor.notes}`);
  }

  if (SCORE_ONLY) return;
  // Ohne Mail bleiben Alert-Mails ungelesen, damit ihre Liste im nächsten Lauf nicht verloren ist.
  const mailing = config.mail && !NO_MAIL;
  if (mailing) {
    for (const entry of alerts.unresolved) seen[alertKey(entry)] = { key: alertKey(entry), titleKey: titleKey(entry), company: entry.company, title: entry.title, url: entry.url, at: new Date().toISOString() };
  }
  writeJson(SEEN_PATH, seen);
  writeJson(CANDIDATES_PATH, keepRecent(candidatesStore));
  if (!mailing) return;

  sendRunMail({ matches, toCheck, loaded: unique.length, candidates: candidates.length, config });
  alerts.commit();
}

function sendRunMail({ matches, toCheck, loaded, candidates, config }) {
  const lastMail = fs.existsSync(LAST_MAIL_PATH) ? Number(fs.readFileSync(LAST_MAIL_PATH, "utf8")) : Date.now() - 24 * 60 * 60 * 1000;
  // Stellen über der Schwelle waren schon in einer Treffer-Mail oder kommen im nächsten Lauf.
  const requests = readRequests();
  const scored = readScoresSince(lastMail)
    .filter((record) => record.score < config.threshold)
    .map((record) => ({ ...record, ref: assignRef(requests, record) }));
  const numbered = matches.map((match) => ({ ...match, ref: assignRef(requests, { ...match.job, score: match.result.score }) }));
  const list = { scored, threshold: config.threshold, listMinScore: config.listMinScore };
  if (matches.length) {
    sendMail(config.mail, matchMail(numbered, toCheck, list), STATE_DIR);
    log(`Mail mit ${matches.length} Treffer(n) verschickt.`);
  } else if (toCheck.length || new Date(lastMail).toDateString() !== new Date().toDateString()) {
    // Erster Lauf des Tages ohne Treffer: Lebenszeichen statt Funkstille.
    sendMail(config.mail, statusMail({ loaded, candidates, ...list, alerts: toCheck }), STATE_DIR);
    log(`Statusmail verschickt (${scored.length} bewertet seit der letzten Mail, ${toCheck.length} zum Selbstprüfen).`);
  } else {
    return;
  }
  writeJson(REQUESTS_PATH, { ...requests, refs: keepRecent(requests.refs) });
  fs.writeFileSync(LAST_MAIL_PATH, String(Date.now()));
}

function readRequests() {
  return readJson(REQUESTS_PATH, { nextRef: 1, refs: {}, queue: [], processedUids: [] });
}

// Eine Stelle behält ihre Nummer über alle Mails hinweg.
function assignRef(requests, { key, company, title, url, score }) {
  const existing = Object.entries(requests.refs).find(([, entry]) => entry.key === key);
  if (existing) return Number(existing[0]);
  const ref = requests.nextRef;
  requests.nextRef += 1;
  requests.refs[ref] = { key, company, title, url, score, at: new Date().toISOString() };
  return ref;
}

// Antworten mit Stellennummern lesen, in die Warteschlange stellen und höchstens `maxRequestsPerRun` CVs bauen.
// Die Warteschlange liegt auf der Platte, damit ein Absturz keine Anforderung verliert.
function handleReplies(config, seen, candidatesStore) {
  if (!config.alerts || !config.mail || NO_MAIL) return;
  const requests = readRequests();
  let replies;
  try {
    replies = readReplies(config, requests.processedUids);
  } catch (error) {
    log(`⚠ Antworten nicht gelesen: ${error.message}`);
    return;
  }
  for (const reply of replies) {
    requests.processedUids = [...requests.processedUids, reply.uid].slice(-200);
    if (!reply.signed) {
      log(`⚠ Antwort ohne gültige Signatur ignoriert: ${reply.subject}`);
      continue;
    }
    // Ohne Nummern (z. B. Antwort auf eine ältere Mail): Stellen über die Links im Zitat erkennen.
    const picked = reply.refs.length ? null : pickJobs(reply, readScoresSince(0));
    const refs = picked ? picked.chosen.map((record) => assignRef(requests, record)) : reply.refs;
    const choices = picked && !refs.length ? picked.offered.map((record) => ({ ...record, ref: assignRef(requests, record) })) : [];
    const queued = new Set(requests.queue.flatMap((item) => item.refs));
    const known = refs.filter((ref) => requests.refs[ref] && !queued.has(ref));
    const unknown = refs.filter((ref) => !requests.refs[ref]);
    log(`Antwort erhalten: ${refs.map((ref) => `J${ref}`).join(", ") || `keine Stellennummer, ${choices.length} Stellen im Zitat`}`);
    if (known.length) requests.queue.push({ refs: known, unknown, messageId: reply.messageId, subject: reply.subject });
    else {
      const pending = refs.filter((ref) => queued.has(ref));
      sendMail(config.mail, { ...requestMail({ subject: reply.subject, results: [], unknown, queued: pending, choices }), inReplyTo: reply.messageId }, STATE_DIR);
    }
  }
  writeJson(REQUESTS_PATH, requests);

  let budget = config.maxRequestsPerRun;
  while (budget > 0 && requests.queue.length) {
    const item = requests.queue[0];
    const now = item.refs.slice(0, budget);
    const later = item.refs.slice(budget);
    budget -= now.length;
    const results = now.map((ref) => fulfil(ref, requests.refs[ref], config, seen, candidatesStore));
    sendMail(config.mail, { ...requestMail({ subject: item.subject, results, unknown: item.unknown, queued: later }), inReplyTo: item.messageId }, STATE_DIR);
    log(`Mail mit ${results.length} angeforderten CV(s) verschickt.`);
    if (later.length) requests.queue[0] = { ...item, refs: later, unknown: [] };
    else requests.queue.shift();
    writeJson(REQUESTS_PATH, requests);
    writeJson(SEEN_PATH, seen);
    writeJson(CANDIDATES_PATH, keepRecent(candidatesStore));
  }
}

// Ein angeforderter CV. Wirft nie: Fehler landen wie beim Scan im Status und damit in der Mail.
function fulfil(ref, entry, config, seen, candidatesStore) {
  const done = seen[entry.key];
  let candidate = candidatesStore[entry.key];
  try {
    if (!candidate) {
      // Vor der Einführung der Anforderungen bewertet: neu bewerten, die Anzeige liest der Score-Schritt über den Link.
      const job = { key: entry.key, company: entry.company, title: entry.title, url: entry.url, location: "", salary: "", postedAt: "unbekannt", description: "" };
      candidate = { job, result: scoreJob(job, config), at: new Date().toISOString() };
      candidatesStore[entry.key] = candidate;
    }
  } catch (error) {
    log(`⚠ Neubewertung fehlgeschlagen für ${entry.company} · ${entry.title}: ${error.message}`);
    const job = { company: entry.company, title: entry.title, url: entry.url, slug: done?.slug ?? "" };
    const result = { score: entry.score, verdict: "nicht neu bewertet", gaps: [], liveVerified: false };
    return { ref, job, result, tailor: { status: "failed", pdfPath: "", openQuestions: [], notes: error.message.slice(0, 300) }, review: null };
  }

  const job = { ...candidate.job, slug: done?.slug ?? slugify(`${candidate.job.company}-${candidate.job.title}`) };
  const { result } = candidate;
  const flagged = matchesCompany(job.company, config.flagCompanies);
  if (done?.pdf && fs.existsSync(done.pdf)) {
    return { ref, job, result, flagged, tailor: { status: "ready", pdfPath: done.pdf, openQuestions: [], notes: "" }, review: null };
  }

  log(`Angefordert: J${ref} · ${job.company} · ${job.title} (${result.score})`);
  // Eine schon angelegte Akte (z. B. von Hand ergänzt) nicht überschreiben.
  if (!fs.existsSync(path.join(ROOT, "applications", job.slug, "job.md"))) writeJobFile(job, result);
  const { tailor, review } = tailorAndReview(job, result, config);
  log(`→ Ergebnis ${tailor.status}: ${tailor.pdfPath || tailor.notes}`);
  seen[entry.key] = {
    ...(done ?? { key: entry.key, company: job.company, title: job.title, url: job.url, score: result.score, at: new Date().toISOString() }),
    slug: job.slug,
    tailor: tailor.status,
    requested: true,
    ...(tailor.status === "ready" ? { pdf: tailor.pdfPath } : {}),
  };
  return { ref, job, result, tailor, review, flagged };
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

// Zweite Stufe für Alert-Stellen, die auf keinem bekannten ATS-Board stehen: Claude sucht die Originalanzeige
// per Websuche auf der Karriereseite der Firma. Gefundene Stellen laufen durch die normale Bewertung.
// Ohne Fund ein zweiter Versuch am nächsten Tag (neue Anzeigen sind oft noch nicht indexiert), danach verworfen.
const fs = require("node:fs");
const path = require("node:path");
const { renderPrompt, runClaude, LOOKUP_SCHEMA } = require("./claude");
const { titleKey, FOCUS_TITLE } = require("./filter");
const log = require("./log");

// Jobbörsen nie aufrufen (Account-Risiko, Nutzungsbedingungen), Aggregatoren zählen nicht als Originalanzeige.
const BLOCKED_DOMAINS = [
  "linkedin.com", "hiring.cafe", "hiringcafe.com", "indeed.com", "indeed.de", "glassdoor.com", "glassdoor.de",
  "stepstone.de", "ziprecruiter.com", "builtin.com", "wellfound.com", "monster.com", "monster.de", "xing.com",
];
const DISALLOWED_TOOLS = BLOCKED_DOMAINS.flatMap((domain) => ["", "www.", "de."].map((sub) => `WebFetch(domain:${sub}${domain})`));
const MAX_ATTEMPTS = 2;
const RETRY_AFTER_HOURS = 20;
const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;

function isBlocked(url) {
  try {
    const host = new URL(url).hostname.toLowerCase();
    return BLOCKED_DOMAINS.some((domain) => host === domain || host.endsWith(`.${domain}`));
  } catch {
    return true;
  }
}

// Ein Treffer wird zur normalen Stelle. Der Schlüssel hängt an Firma und Titel, nicht an der Jobbörse.
function toJob(entry, result, foundAt) {
  return {
    key: `web:${titleKey(entry)}`,
    company: entry.company,
    title: result.title || entry.title,
    location: result.location || entry.location,
    salary: result.salary || entry.salary || "",
    url: result.url,
    postedAt: Date.parse(result.postedAt) ? result.postedAt : foundAt,
    description: result.description,
    source: "web",
    via: entry.via,
    focus: false,
  };
}

function validResult(result) {
  return result.found && result.url && !isBlocked(result.url) && (result.description ?? "").length >= 300;
}

function readState(statePath) {
  const empty = { results: {}, pending: [] };
  return fs.existsSync(statePath) ? { ...empty, ...JSON.parse(fs.readFileSync(statePath, "utf8")) } : empty;
}

// `entries`: neue Alert-Stellen nach Vorfilter. Liefert die Treffer (auch aus früheren Läufen, solange jung genug),
// die wartenden und die endgültig verworfenen Stellen. `search: false` liest nur den Speicher (Testlauf).
async function lookupAlerts(entries, config, stateDir, { search = true, now = Date.now() } = {}) {
  const statePath = path.join(stateDir, "lookups.json");
  const state = readState(statePath);
  const save = () => fs.writeFileSync(statePath, JSON.stringify(state, null, 2));

  // Plattform- und Monetarisierungs-Titel zuerst, falls das Limit greift.
  const queue = [...new Map([...state.pending, ...entries].map((entry) => [titleKey(entry), entry])).values()]
    .sort((a, b) => FOCUS_TITLE.test(b.title) - FOCUS_TITLE.test(a.title));
  const pending = [];
  const dropped = [];
  let searched = 0;
  let found = 0;
  let costUSD = 0;

  for (const entry of queue) {
    const key = titleKey(entry);
    const known = state.results[key];
    if (known?.found) continue;
    const attempts = known?.attempts ?? 0;
    if (attempts >= MAX_ATTEMPTS) {
      dropped.push({ ...entry, lookup: known.reason });
      continue;
    }
    const waiting = known && now - Date.parse(known.at) < RETRY_AFTER_HOURS * HOUR;
    if (waiting || !search || searched >= config.maxLookupsPerRun) {
      pending.push(entry);
      continue;
    }
    searched += 1;
    let result;
    try {
      result = runClaude({
        prompt: renderPrompt("lookup", { company: entry.company, title: entry.title, location: entry.location || "keine Angabe" }),
        model: config.models.lookup,
        budget: config.budgetUSD.lookup,
        schema: LOOKUP_SCHEMA,
        tools: ["WebSearch", "WebFetch"],
        disallowedTools: DISALLOWED_TOOLS,
      });
    } catch (error) {
      // Abgebrochene Suche (Budget, Netz) zählt nicht als Versuch.
      log(`⚠ Websuche fehlgeschlagen für ${entry.company} · ${entry.title}: ${error.message.slice(0, 200)}`);
      pending.push(entry);
      continue;
    }
    costUSD += result.costUSD ?? 0;
    const at = new Date(now).toISOString();
    if (validResult(result)) {
      state.results[key] = { at, found: true, entry, job: toJob(entry, result, at) };
      found += 1;
      log(`  Websuche: ${entry.company} · ${entry.title} → ${result.url}`);
    } else {
      const reason = result.found ? "Fund verworfen (Jobbörse oder ohne Anzeigentext)" : result.reason;
      state.results[key] = { at, found: false, attempts: attempts + 1, entry, reason };
      const final = attempts + 1 >= MAX_ATTEMPTS;
      (final ? dropped : pending).push({ ...entry, lookup: reason });
      log(`  Websuche: ${entry.company} · ${entry.title} → nicht gefunden, ${final ? "verworfen" : "neuer Versuch morgen"} (${reason})`);
    }
    save();
  }

  // Alte Einträge aufräumen. Solange ein Eintrag besteht, wird dieselbe Stelle aus einer neuen Alert-Mail nicht erneut gesucht.
  const keepFor = Math.max(config.maxAgeDays, 7) * DAY;
  state.results = Object.fromEntries(Object.entries(state.results).filter(([, record]) => now - Date.parse(record.at) < keepFor));
  state.pending = pending;
  if (search) save();

  const jobs = Object.values(state.results)
    .filter((record) => record.found && now - Date.parse(record.at) < config.maxAgeDays * DAY)
    .map((record) => record.job);
  // Gefundene und wartende Stellen nicht als gesehen markieren, sonst fallen sie im Vorfilter heraus.
  const deferred = new Set([...pending, ...Object.values(state.results).filter((r) => r.found).map((r) => r.entry)].map(titleKey));
  return { jobs, pending, dropped, deferred, searched, found, costUSD };
}

module.exports = { lookupAlerts, isBlocked, toJob, validResult, BLOCKED_DOMAINS };

// Vorfilter ohne KI. Reine Funktionen, getestet in filter.test.js.

const PLATFORM_TITLE = /platform|plattform|\bapis?\b|developer|infrastructure|integrations?\b|\bcore\b|internal/i;

// Für Generalisten (Quelle mit `focus: true`) zählen nur Stellen mit Plattform-, API- oder Monetarisierungs-Bezug.
const FOCUS_TITLE = new RegExp(`${PLATFORM_TITLE.source}|connectivity|payments?|billing|monetization|pricing|revenue|checkout|subscriptions?|metering|usage|quote|commerce|ledger|treasury`, "i");

// Manche Feeds liefern statt eines Orts nur das Arbeitsmodell. Das gilt als „kein Ort", nicht als Ausschluss.
const WORK_MODE_ONLY = /^[\s·;,]*((hybrid|remote|on-?site|in-office|n\/a)[\s·;,]*)*$/i;

const normalize = (name = "") => name.toLowerCase().replace(/[^a-z0-9]/g, "");
const matchesCompany = (company, list) => list.some((entry) => normalize(company).includes(normalize(entry)));
// Gender-Zusätze wie (m/w/d) oder (f/m/d) unterscheiden sonst identische Ausschreibungen.
const GENDER_TAG = /\((\s*[mwfdxh]\s*[|/]){1,3}\s*[mwfdxh]\s*\)|\((all genders|alle geschlechter|gn\*?)\)/gi;
const titleKey = (job) => `${normalize(job.company)}:${normalize(job.title.replace(GENDER_TAG, ""))}`;

function passesTitle(title, config) {
  return config.titleInclude.test(title) && !config.titleExclude.test(title);
}

function passesLocation(location = "", config) {
  if (WORK_MODE_ONLY.test(location)) return true;
  return config.locationInclude.test(location) && !config.locationExclude.test(location);
}

function prefilter(jobs, config, seen, now = Date.now()) {
  const cutoff = now - config.maxAgeDays * 24 * 60 * 60 * 1000;
  // Dieselbe Rolle wird oft mehrfach pro Standort ausgeschrieben.
  const seenTitles = new Set(Object.values(seen).map((record) => record.titleKey));
  const unique = [...new Map(jobs.map((job) => [titleKey(job), { ...job, titleKey: titleKey(job) }])).values()];
  const candidates = unique
    .filter((job) => !seen[job.key] && !seenTitles.has(job.titleKey))
    .filter((job) => passesTitle(job.title, config))
    .filter((job) => !job.focus || FOCUS_TITLE.test(job.title))
    .filter((job) => passesLocation(job.location, config))
    .filter((job) => !matchesCompany(job.company, config.excludeCompanies))
    .filter((job) => !job.postedAt || new Date(job.postedAt).getTime() >= cutoff)
    // Plattform-Stellen zuerst, damit sie nie am Limit pro Lauf hängen bleiben. Danach die neuesten.
    .sort((a, b) =>
      PLATFORM_TITLE.test(b.title) - PLATFORM_TITLE.test(a.title) ||
      new Date(b.postedAt ?? 0) - new Date(a.postedAt ?? 0));
  return { unique, candidates };
}

module.exports = { prefilter, passesTitle, passesLocation, matchesCompany, normalize, titleKey, PLATFORM_TITLE, FOCUS_TITLE };

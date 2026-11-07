// Alert-Mails von Jobbörsen (bisher hiring.cafe) aus dem Scanner-Postfach lesen.
// Die Börse selbst wird nie aufgerufen: Jede Stelle wird auf der Karriereseite der Firma gesucht.
const fs = require("node:fs");
const path = require("node:path");
const { execFileSync } = require("node:child_process");
const { fetchSource } = require("./sources");
const { keychainPassword } = require("./mail");
const { normalize } = require("./filter");

const SINCE_DAYS = 7;
// Firmen ohne gefundenes Board erst nach dieser Zeit erneut durchprobieren.
const RETRY_NONE_DAYS = 30;
const PROBE_ATS = ["greenhouse", "ashby", "lever", "smartrecruiters"];
const GENDER_TAG = /\((\s*[mwfdxh]\s*[|/]){1,3}\s*[mwfdxh]\s*\)/gi;

function decodeQuotedPrintable(text) {
  const soft = text.replace(/=\r?\n/g, "");
  const bytes = [];
  for (let i = 0; i < soft.length; i += 1) {
    const hex = soft.slice(i + 1, i + 3);
    if (soft[i] === "=" && /^[0-9A-F]{2}$/i.test(hex)) {
      bytes.push(parseInt(hex, 16));
      i += 2;
    } else {
      bytes.push(...Buffer.from(soft[i]));
    }
  }
  return Buffer.from(bytes).toString("utf8");
}

// Text-Teil einer MIME-Mail. Reicht für die Alert-Mails, kein vollständiger MIME-Parser.
function plainText(eml) {
  for (const part of eml.split(/^--\S+\r?$/m)) {
    const [headers, ...body] = part.replace(/^\r?\n/, "").split(/\r?\n\r?\n/);
    if (!/content-type:\s*text\/plain/i.test(headers)) continue;
    const content = body.join("\n\n");
    if (/content-transfer-encoding:\s*quoted-printable/i.test(headers)) return decodeQuotedPrintable(content);
    if (/content-transfer-encoding:\s*base64/i.test(headers)) return Buffer.from(content, "base64").toString("utf8");
    return content;
  }
  return "";
}

// Aufbau: Suchname, „Top N matches“, dann je Stelle Nummer + Titel, Link, Company, Location, Compensation, Anforderungen.
function parseHiringCafe(text) {
  const entries = [];
  let search = "";
  let entry = null;
  let previous = "";
  for (const line of text.split(/\r?\n/)) {
    const title = line.match(/^\s{2}\d+\.\s+(.+?)\s*$/);
    // Der Suchname steht direkt vor „Top N matches“, mal eingerückt, mal nicht.
    if (/^\s*Top \d+ matches/i.test(line)) {
      search = previous;
      entry = null;
    } else if (title) {
      entry = { title: title[1], search, company: "", location: "", salary: "", summary: "", url: "", via: "hiring.cafe" };
      entries.push(entry);
    } else if (entry && /^\S/.test(line)) {
      entry = null;
    } else if (entry) {
      const field = line.match(/^\s+(→|Company:|Location:|Compensation:)\s*(.+?)\s*$/);
      if (field) entry[{ "→": "url", "Company:": "company", "Location:": "location", "Compensation:": "salary" }[field[1]]] = field[2];
      else if (line.trim() && !entry.summary) entry.summary = line.trim();
    }
    if (line.trim()) previous = line.trim();
  }
  return entries.filter((e) => e.company);
}

const PARSERS = { "hiring.cafe": parseHiringCafe };

function slugCandidates(company) {
  const base = company.toLowerCase().replace(/\.(com|io|ai|de)$/, "").replace(/[,.]?\s+(inc|gmbh|ltd|llc|group|ag|se)\.?$/, "").trim();
  const words = base.split(/\s+/);
  return [...new Set([
    base.replace(/[^a-z0-9]/g, ""),
    base.replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, ""),
    // Nur das erste Wort, wenn es aussagekräftig ist („us“ aus „US Mobile“ träfe fremde Boards).
    ...(words.length > 1 && words[0].length >= 4 ? [words[0].replace(/[^a-z0-9]/g, "")] : []),
  ])].filter(Boolean);
}

const sameTitle = (a, b) => normalize(a.replace(GENDER_TAG, "")) === normalize(b.replace(GENDER_TAG, ""));

// Klare Ausschlüsse nach den Score-Regeln, nur aus den Angaben der Alert-Mail.
function snippetExclusion(entry, config) {
  const amounts = (entry.salary.match(/\d[\d,.]*/g) ?? []).map((n) => Number(n.replace(/[,.]/g, "")));
  // Ohne Umrechnung: Ein Dollar-Band unter der Euro-Untergrenze liegt auch in Euro darunter.
  if (config.salaryFloorEUR && /year|jahr/i.test(entry.salary) && amounts.length && Math.max(...amounts) < config.salaryFloorEUR) {
    return `Gehaltsband bis ${Math.max(...amounts).toLocaleString("de-DE")}`;
  }
  const knockout = (config.snippetKnockouts ?? []).find(({ pattern }) => pattern.test(entry.summary));
  if (knockout) return knockout.reason;
  const years = entry.summary.match(/(\d+)\+?\s*(?:[-–]\s*\d+\s*)?years/i);
  if (years && Number(years[1]) <= 2) return `Junior-Profil (${years[1]}+ Jahre)`;
  return null;
}

function imap(config, url, command) {
  const password = keychainPassword(config.mail);
  // Zugangsdaten über stdin, damit sie nicht in der Prozessliste auftauchen.
  return execFileSync("curl", ["--silent", "--show-error", "--url", url, ...(command ? ["-X", command] : []), "--config", "-"], {
    input: `user = "${config.mail.from}:${password}"\n`,
    encoding: "utf8",
    maxBuffer: 50 * 1024 * 1024,
  });
}

const imapDate = (date) => `${date.getUTCDate()}-${date.toLocaleString("en-US", { month: "short", timeZone: "UTC" })}-${date.getUTCFullYear()}`;

function fetchAlertMails(config, processed) {
  const since = imapDate(new Date(Date.now() - SINCE_DAYS * 24 * 60 * 60 * 1000));
  return config.alerts.senders.flatMap((sender) => {
    const result = imap(config, config.alerts.imapUrl, `UID SEARCH FROM "${sender}" SINCE ${since}`);
    const uids = (result.match(/^\* SEARCH ([\d ]*)/m)?.[1] ?? "").split(" ").filter(Boolean);
    return uids
      .filter((uid) => !processed.includes(uid))
      .map((uid) => ({ uid, sender, text: plainText(imap(config, `${config.alerts.imapUrl};UID=${uid}`)) }));
  });
}

// Sucht das Board einer Firma bei den bekannten ATS und darin die Stelle. Boards werden pro Lauf nur einmal geladen.
async function resolveOnAts(entry, boardsCache, loaded) {
  const load = (ats, slug) => {
    const id = `${ats}:${slug}`;
    if (!loaded.has(id)) loaded.set(id, fetchSource({ ats, slug, company: entry.company }).catch(() => []));
    return loaded.get(id);
  };
  // Gleiche Stelle an mehreren Standorten: die mit dem Ort aus der Mail bevorzugen.
  const places = entry.location.toLowerCase().split(/\s+or\s+|[,()]/).map((p) => p.trim()).filter((p) => p.length > 2);
  const find = (jobs) => {
    const hits = jobs.filter((job) => sameTitle(job.title, entry.title));
    return hits.find((job) => places.some((place) => job.location.toLowerCase().includes(place))) ?? hits[0];
  };
  const cacheKey = normalize(entry.company);
  const cached = boardsCache[cacheKey];
  if (cached?.ats) return find(await load(cached.ats, cached.slug)) ?? null;
  if (cached?.none && Date.now() - Date.parse(cached.at) < RETRY_NONE_DAYS * 24 * 60 * 60 * 1000) return null;

  const probes = slugCandidates(entry.company).flatMap((slug) => PROBE_ATS.map((ats) => ({ ats, slug })));
  const boards = await Promise.all(probes.map(async (probe) => ({ ...probe, jobs: await load(probe.ats, probe.slug) })));
  // Ein Board zählt nur, wenn die Stelle darauf steht. Sonst ist es womöglich eine Namensvetterin.
  const hit = boards.find((board) => find(board.jobs));
  boardsCache[cacheKey] = hit ? { ats: hit.ats, slug: hit.slug, at: new Date().toISOString() } : { none: true, at: new Date().toISOString() };
  return hit ? find(hit.jobs) : null;
}

// Klick-Tracking-Links nur bis zum Redirect auflösen, das Ziel selbst wird nicht aufgerufen.
async function directLink(url) {
  if (!/\.ct\.sendgrid\.net\//.test(url)) return url;
  try {
    const response = await fetch(url, { redirect: "manual", signal: AbortSignal.timeout(10_000) });
    const target = response.headers.get("location");
    return target ? target.split("?")[0] : url;
  } catch {
    return url;
  }
}

// Liefert die auf Karriereseiten gefundenen Stellen (laufen durch die normale Pipeline) und den Rest zum Selbstprüfen.
// `commit` erst nach dem Mailversand aufrufen, damit eine Mail bei einem Absturz im nächsten Lauf erneut gelesen wird.
async function readAlerts(config, stateDir) {
  const statePath = path.join(stateDir, "alerts.json");
  const state = fs.existsSync(statePath) ? JSON.parse(fs.readFileSync(statePath, "utf8")) : { processedUids: [], boards: {} };
  const mails = fetchAlertMails(config, state.processedUids);
  const entries = mails.flatMap((mail) => PARSERS[mail.sender](mail.text));
  const unique = [...new Map(entries.map((e) => [`${normalize(e.company)}:${normalize(e.title)}`, e])).values()];

  const loaded = new Map();
  const jobs = [];
  const unresolved = [];
  for (const entry of unique) {
    const job = await resolveOnAts(entry, state.boards, loaded);
    if (job) jobs.push({ ...job, focus: false, via: entry.via });
    else unresolved.push({ ...entry, url: await directLink(entry.url) });
  }
  return {
    mails: mails.length,
    jobs,
    unresolved,
    commit() {
      state.processedUids = [...state.processedUids, ...mails.map((m) => m.uid)].slice(-200);
      fs.writeFileSync(statePath, JSON.stringify(state, null, 2));
    },
  };
}

module.exports = { readAlerts, plainText, parseHiringCafe, slugCandidates, snippetExclusion, imap, imapDate };

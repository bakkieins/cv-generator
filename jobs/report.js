// Text der Treffer-Mail. Reine Funktionen, getestet in report.test.js.
const fs = require("node:fs");
const path = require("node:path");

const notKept = (review) => review.review.filter((r) => r.verdict !== "behalten");
const refLabel = (ref) => (ref ? `J${ref} · ` : "");
const REPLY_HINT = "Für einen CV zu einer Stelle, auch unter der Schwelle, einfach auf diese Mail antworten und die Nummer nennen, z. B. „J12“ oder „J12, J15“.";

function cvLine(tailor, review) {
  if (tailor.status === "ready") return `✓ angehängt, vom Review freigegeben (${path.basename(tailor.pdfPath)})`;
  const reason = tailor.status === "blocked"
    ? `Review nicht freigegeben: ${review.blocking.map((b) => `${b.where}: ${b.issue}`).join(" | ")}`
    : tailor.notes || "unbekannter Fehler";
  return `✗ KEIN CV ANGEHÄNGT. Grund: ${reason}`;
}

function matchBlock({ ref, job, result, tailor, review, flagged }) {
  return [
    `■ ${refLabel(ref)}${job.company} · ${job.title}  (${result.score}/100)`,
    flagged ? "  ⚠ Firma steht schon im Bewerbungsstand, vorher prüfen" : null,
    `  Ort: ${job.location || "keine Angabe"}${job.salary ? ` · Gehalt: ${job.salary}` : ""}`,
    `  Link: ${job.url}${result.liveVerified ? "" : " (nicht live verifiziert)"}`,
    `  Warum: ${result.verdict}`,
    `  Lücken: ${result.gaps.join(" | ") || "keine"}`,
    `  CV: ${cvLine(tailor, review)}`,
    review?.release && notKept(review).length
      ? `  Review-Hinweise: ${notKept(review).map((r) => `${r.where} (${r.verdict})`).join(" | ")}`
      : null,
    tailor.openQuestions.length ? `  Offene Fragen: ${tailor.openQuestions.join(" | ")}` : null,
    `  Akte: applications/${job.slug}/job.md`,
  ].filter(Boolean).join("\n");
}

// Stellen aus Alert-Mails ohne auffindbare Originalanzeige: nur zum Selbstprüfen, kein Score, kein CV.
function alertSection(entries) {
  if (!entries.length) return "";
  const block = (e) => [
    `■ ${e.company} · ${e.title}`,
    `  Ort: ${e.location || "keine Angabe"}${e.salary ? ` · Gehalt: ${e.salary}` : ""}`,
    e.summary ? `  Anforderungen: ${e.summary}` : null,
    `  Link: ${e.url} (${e.via}, Suche „${e.search}“)`,
  ].filter(Boolean).join("\n");
  return `\nAus Alert-Mails, Originalanzeige auf keiner bekannten Karriereseite gefunden (${entries.length}). Ohne Score und ohne CV, bitte selbst prüfen:\n\n${entries.map(block).join("\n\n")}\n`;
}

// Bewertete Stellen unter der Schwelle, mit Nummer zum Anfordern eines CV. Mindestens die drei besten,
// dazu alle ab `listMinScore`.
function belowList(scored, listMinScore) {
  const sorted = [...scored].sort((a, b) => b.score - a.score);
  return sorted.filter((record, index) => index < 3 || record.score >= listMinScore);
}

const belowLine = (r) => `  ${refLabel(r.ref)}${r.score} · ${r.company} · ${r.title}\n       ${r.url}`;

function belowSection(scored, threshold, listMinScore) {
  const list = belowList(scored, listMinScore);
  if (!list.length) return "";
  return `\nUnter der Schwelle ${threshold} (${scored.length} bewertet seit der letzten Mail):\n\n${list.map(belowLine).join("\n")}\n`;
}

function matchMail(matches, alerts = [], { scored = [], threshold, listMinScore } = {}) {
  const ready = matches.filter((m) => m.tailor.status === "ready");
  const missing = matches.filter((m) => m.tailor.status !== "ready");
  const intro = [
    `neue Treffer über der Schwelle: ${matches.length}, davon ${ready.length} mit freigegebenem CV im Anhang. Beworben wurde noch nichts.`,
    missing.length
      ? `Ohne CV: ${missing.map((m) => m.job.company).join(", ")}. Zum Nachbessern in Claude Code im cv-generator sagen: „CV für applications/<Akte> nachbessern“.`
      : null,
    REPLY_HINT,
  ].filter(Boolean).join("\n");
  return {
    subject: `Job-Scanner: ${ready.length} von ${matches.length} CVs bereit (${matches.map((m) => m.job.company).join(", ")})`,
    text: `Hi Ben,\n\n${intro}\n\n${matches.map(matchBlock).join("\n\n")}\n${belowSection(scored, threshold, listMinScore)}${alertSection(alerts)}`,
    attachments: ready.map((m) => m.tailor.pdfPath).filter((file) => fs.existsSync(file)),
  };
}

// Lebenszeichen am Tag ohne Treffer: zeigt, dass der Scanner läuft und wie knapp die besten Stellen lagen.
function statusMail({ loaded, candidates, scored, threshold, listMinScore, alerts = [] }) {
  const list = belowList(scored, listMinScore);
  const best = list.length
    ? `Die besten Scores seit der letzten Mail (${scored.length} bewertet):\n\n${list.map(belowLine).join("\n")}\n\n${REPLY_HINT}`
    : "Seit der letzten Mail wurde keine neue Stelle bewertet.";
  return {
    subject: `Job-Scanner: keine Treffer${list.length ? ` (bester Score ${list[0].score})` : ""}${alerts.length ? `, ${alerts.length} zum Selbstprüfen` : ""}`,
    text: `Hi Ben,\n\nseit der letzten Mail keine Stelle über der Schwelle ${threshold}. Der Scanner läuft: Im letzten Lauf ${loaded} Stellen geladen, ${candidates} neue Kandidaten nach Vorfilter.\n\n${best}\n${alertSection(alerts)}`,
  };
}

// Antwort auf eine Anforderung per Mail, im selben Thread. `unknown`: Nummern ohne bekannte Stelle.
// `choices`: Stellen aus der zitierten Mail, wenn die Antwort keine bestimmte Stelle nennt.
function requestMail({ subject, results, unknown = [], queued = [], choices = [] }) {
  const ready = results.filter((m) => m.tailor.status === "ready");
  const intro = [
    results.length ? `angeforderte CVs: ${results.length}, davon ${ready.length} vom Review freigegeben im Anhang. Beworben wurde noch nichts.` : null,
    unknown.length ? `Unbekannte Nummer${unknown.length > 1 ? "n" : ""}: ${unknown.map((ref) => `J${ref}`).join(", ")}. Die Nummern stehen in den Scanner-Mails vor jeder Stelle.` : null,
    queued.length ? `Noch in Arbeit, kommt mit der nächsten Mail: ${queued.map((ref) => `J${ref}`).join(", ")}.` : null,
    choices.length ? `zu welcher Stelle soll ich den CV bauen? Antworte auf diese Mail mit der Nummer, z. B. „J${choices[0].ref}“, oder mehreren.\n\n${choices.map(belowLine).join("\n")}` : null,
    !results.length && !unknown.length && !queued.length && !choices.length ? `in deiner Antwort habe ich keine Stellennummer gefunden. ${REPLY_HINT}` : null,
  ].filter(Boolean).join("\n");
  return {
    subject: /^re:/i.test(subject) ? subject : `Re: ${subject}`,
    text: `Hi Ben,\n\n${intro}\n\n${results.map(matchBlock).join("\n\n")}\n`,
    attachments: ready.map((m) => m.tailor.pdfPath).filter((file) => fs.existsSync(file)),
  };
}

module.exports = { cvLine, matchMail, statusMail, requestMail };

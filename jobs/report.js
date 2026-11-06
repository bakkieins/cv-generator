// Text der Treffer-Mail. Reine Funktionen, getestet in report.test.js.
const fs = require("node:fs");
const path = require("node:path");

const notKept = (review) => review.review.filter((r) => r.verdict !== "behalten");

function cvLine(tailor, review) {
  if (tailor.status === "ready") return `✓ angehängt, vom Review freigegeben (${path.basename(tailor.pdfPath)})`;
  const reason = tailor.status === "blocked"
    ? `Review nicht freigegeben: ${review.blocking.map((b) => `${b.where}: ${b.issue}`).join(" | ")}`
    : tailor.notes || "unbekannter Fehler";
  return `✗ KEIN CV ANGEHÄNGT. Grund: ${reason}`;
}

function matchBlock({ job, result, tailor, review, flagged }) {
  return [
    `■ ${job.company} · ${job.title}  (${result.score}/100)`,
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

function matchMail(matches, alerts = []) {
  const ready = matches.filter((m) => m.tailor.status === "ready");
  const missing = matches.filter((m) => m.tailor.status !== "ready");
  const intro = [
    `neue Treffer über der Schwelle: ${matches.length}, davon ${ready.length} mit freigegebenem CV im Anhang. Beworben wurde noch nichts.`,
    missing.length
      ? `Ohne CV: ${missing.map((m) => m.job.company).join(", ")}. Zum Nachbessern in Claude Code im cv-generator sagen: „CV für applications/<Akte> nachbessern“.`
      : null,
  ].filter(Boolean).join("\n");
  return {
    subject: `Job-Scanner: ${ready.length} von ${matches.length} CVs bereit (${matches.map((m) => m.job.company).join(", ")})`,
    text: `Hi Ben,\n\n${intro}\n\n${matches.map(matchBlock).join("\n\n")}\n${alertSection(alerts)}`,
    attachments: ready.map((m) => m.tailor.pdfPath).filter((file) => fs.existsSync(file)),
  };
}

// Lebenszeichen am Tag ohne Treffer: zeigt, dass der Scanner läuft und wie knapp die besten Stellen lagen.
function statusMail({ loaded, candidates, scored, threshold, alerts = [] }) {
  const top = [...scored].sort((a, b) => b.score - a.score).slice(0, 3);
  const best = top.length
    ? `Die besten Scores seit der letzten Mail (${scored.length} bewertet):\n\n${top.map((r) => `  ${r.score} · ${r.company} · ${r.title}\n       ${r.url}`).join("\n")}`
    : "Seit der letzten Mail wurde keine neue Stelle bewertet.";
  return {
    subject: `Job-Scanner: keine Treffer${top.length ? ` (bester Score ${top[0].score})` : ""}${alerts.length ? `, ${alerts.length} zum Selbstprüfen` : ""}`,
    text: `Hi Ben,\n\nseit der letzten Mail keine Stelle über der Schwelle ${threshold}. Der Scanner läuft: Im letzten Lauf ${loaded} Stellen geladen, ${candidates} neue Kandidaten nach Vorfilter.\n\n${best}\n${alertSection(alerts)}`,
  };
}

module.exports = { cvLine, matchMail, statusMail };

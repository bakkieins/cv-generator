const test = require("node:test");
const assert = require("node:assert/strict");
const { cvLine, matchMail, statusMail, requestMail } = require("./report");
const { slugify } = require("./dossier");

const match = (company, tailor, review = null) => ({
  job: { company, title: "Senior Product Manager", location: "Berlin", url: `https://example.com/${company}`, slug: slugify(company) },
  result: { score: 80, verdict: "passt", gaps: [], liveVerified: true },
  tailor: { pdfPath: `/nonexistent/${company}.pdf`, openQuestions: [], notes: "", ...tailor },
  review,
});

test("Slug ohne Akzente und Gender-Zusatz, höchstens 40 Zeichen", () => {
  assert.equal(slugify("Café GmbH · Senior Product Manager (m/w/d)"), "cafe-gmbh-senior-product-manager");
  assert.equal(slugify("x".repeat(39) + " yz").length, 39);
});

test("CV-Zeile nennt bei fehlendem Anhang immer den Grund", () => {
  assert.match(cvLine({ status: "ready", pdfPath: "/a/b/CV.pdf" }), /angehängt.*CV\.pdf/);
  assert.match(
    cvLine({ status: "blocked" }, { blocking: [{ where: "Summary", issue: "unbelegt" }] }),
    /KEIN CV.*Summary: unbelegt/,
  );
  assert.match(cvLine({ status: "failed", notes: "" }), /KEIN CV.*unbekannter Fehler/);
});

test("Betreff zählt bereite CVs, Text nennt Firmen ohne CV", () => {
  const mail = matchMail([
    match("Acme", { status: "ready" }, { release: true, blocking: [], review: [{ where: "Bullet 2", verdict: "umschreiben" }] }),
    match("Globex", { status: "failed", notes: "Seitenzahl" }),
  ]);
  assert.equal(mail.subject, "Job-Scanner: 1 von 2 CVs bereit (Acme, Globex)");
  assert.match(mail.text, /Ohne CV: Globex\./);
  assert.match(mail.text, /Review-Hinweise: Bullet 2 \(umschreiben\)/);
  assert.match(mail.text, /Akte: applications\/acme\/job\.md/);
  // Nicht existierende PDFs werden nicht angehängt.
  assert.deepEqual(mail.attachments, []);
});

test("Statusmail nennt die drei besten Scores, auch ohne Bewertung", () => {
  const scored = [40, 66, 12, 60, 50].map((score, i) => ({ score, company: `Firma${i}`, title: "PM", url: `https://example.com/${i}` }));
  const mail = statusMail({ loaded: 8078, candidates: 3, scored, threshold: 75 });
  assert.equal(mail.subject, "Job-Scanner: keine Treffer (bester Score 66)");
  assert.match(mail.text, /Schwelle 75.*8078 Stellen/);
  assert.match(mail.text, /\(5 bewertet\)/);
  assert.deepEqual([...mail.text.matchAll(/^ {2}(\d+) ·/gm)].map((m) => Number(m[1])), [66, 60, 50]);

  const empty = statusMail({ loaded: 100, candidates: 0, scored: [], threshold: 75 });
  assert.equal(empty.subject, "Job-Scanner: keine Treffer");
  assert.match(empty.text, /keine neue Stelle bewertet/);
});

test("Stellen unter der Schwelle stehen mit Nummer in der Mail, die drei besten und alle ab listMinScore", () => {
  const scored = [40, 66, 12, 60, 50, 55].map((score, i) => ({ ref: i + 1, score, company: `Firma${i}`, title: "PM", url: `https://example.com/${i}` }));
  const mail = statusMail({ loaded: 10, candidates: 6, scored, threshold: 75, listMinScore: 50 });
  assert.deepEqual([...mail.text.matchAll(/^ {2}J(\d+) · (\d+) ·/gm)].map((m) => Number(m[2])), [66, 60, 55, 50]);
  assert.match(mail.text, /auf diese Mail antworten.*„J12“/);

  const withMatch = matchMail([{ ...match("Acme", { status: "ready" }), ref: 7 }], [], { scored, threshold: 75, listMinScore: 60 });
  assert.match(withMatch.text, /■ J7 · Acme/);
  assert.match(withMatch.text, /Unter der Schwelle 75 \(6 bewertet/);
  assert.deepEqual([...withMatch.text.matchAll(/^ {2}J\d+ · (\d+) ·/gm)].map((m) => Number(m[1])), [66, 60, 55]);
});

test("Antwort auf eine Anforderung bleibt im Thread und nennt unbekannte und wartende Nummern", () => {
  const mail = requestMail({ subject: "Re: Job-Scanner: keine Treffer", results: [{ ...match("Acme", { status: "ready" }), ref: 3 }], unknown: [99], queued: [4] });
  assert.equal(mail.subject, "Re: Job-Scanner: keine Treffer");
  assert.match(mail.text, /angeforderte CVs: 1, davon 1/);
  assert.match(mail.text, /Unbekannte Nummer: J99/);
  assert.match(mail.text, /kommt mit der nächsten Mail: J4/);
  assert.match(mail.text, /■ J3 · Acme/);

  const empty = requestMail({ subject: "Job-Scanner: 1 von 1 CVs bereit", results: [] });
  assert.equal(empty.subject, "Re: Job-Scanner: 1 von 1 CVs bereit");
  assert.match(empty.text, /keine Stellennummer gefunden/);
});

test("Antwort ohne bestimmte Stelle bietet die Stellen aus dem Zitat mit Nummer an", () => {
  const mail = requestMail({ subject: "Re: Job-Scanner: keine Treffer", results: [], choices: [{ ref: 120, score: 66, company: "Augustus", title: "PM", url: "https://example.com/a" }] });
  assert.match(mail.text, /zu welcher Stelle.*„J120“/);
  assert.match(mail.text, /J120 · 66 · Augustus/);
  assert.doesNotMatch(mail.text, /keine Stellennummer gefunden/);
});

test("Antwort ohne Auftrag nennt den Status des Scanners", () => {
  const mail = requestMail({ subject: "Re: Job-Scanner: x", results: [], status: "Der Scanner läuft. Letzter Scan: Sa., 07.11., 11:17" });
  assert.match(mail.text, /keine Stellennummer gefunden/);
  assert.match(mail.text, /Der Scanner läuft\. Letzter Scan/);
  const withCv = requestMail({ subject: "Re: x", results: [{ ...match("Acme", { status: "ready" }), ref: 1 }], status: "Der Scanner läuft." });
  assert.doesNotMatch(withCv.text, /Der Scanner läuft/);
});

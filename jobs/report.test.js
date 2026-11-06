const test = require("node:test");
const assert = require("node:assert/strict");
const { cvLine, matchMail, statusMail } = require("./report");
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

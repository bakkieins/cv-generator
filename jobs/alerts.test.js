const test = require("node:test");
const assert = require("node:assert/strict");
const { plainText, parseHiringCafe, parseLinkedIn, slugCandidates, snippetExclusion } = require("./alerts");

// Fiktive Mail im Aufbau der hiring.cafe-Sammelmail (Text-Teil quoted-printable).
const EML = [
  "From: Ali from HiringCafe <ali@hiring.cafe>",
  'Content-Type: multipart/alternative; boundary="b1"',
  "",
  "--b1",
  "Content-Transfer-Encoding: quoted-printable",
  "Content-Type: text/plain; charset=utf-8",
  "",
  "Hi Ben,",
  "",
  "  You have 3 new AI job matches from HiringCafe",
  "",
  "  API Product Manager",
  "Top 2 matches for you",
  "  1. Senior Product Manager - APIs & Integrations",
  "     =E2=86=92 https://u1.ct.sendgrid.net/ls/click?upn=3Dabc",
  "     Company: Acme Widgets Inc.",
  "     Location: United States or North America (Remote)",
  "     Compensation: $130,000 =E2=80=93 $180,000 / year",
  "     5+ years product management experience with API products; REST, webhooks, OAu=",
  "th.",
  "",
  "  2. Product Manager",
  "     =E2=86=92 https://u1.ct.sendgrid.net/ls/click?upn=3Ddef",
  "     Company: Globex",
  "     Location: Europe (Remote)",
  "     Compensation: $70,000 =E2=80=93 $85,000 / year",
  "     2+ years in product management.",
  "",
  "--b1",
  "Content-Type: text/html; charset=utf-8",
  "",
  "<html></html>",
  "--b1--",
].join("\r\n");

test("Text-Teil wird aus der MIME-Mail geholt und dekodiert", () => {
  const text = plainText(EML);
  assert.match(text, /→ https:\/\/u1\.ct\.sendgrid\.net\/ls\/click\?upn=abc/);
  assert.match(text, /\$130,000 – \$180,000/);
  assert.match(text, /OAuth\./);
  assert.doesNotMatch(text, /<html>/);
});

test("hiring.cafe-Mail ergibt je Stelle Titel, Firma, Ort, Gehalt und Suche", () => {
  const [first, second] = parseHiringCafe(plainText(EML));
  assert.deepEqual(first, {
    title: "Senior Product Manager - APIs & Integrations",
    search: "API Product Manager",
    company: "Acme Widgets Inc.",
    location: "United States or North America (Remote)",
    salary: "$130,000 – $180,000 / year",
    summary: "5+ years product management experience with API products; REST, webhooks, OAuth.",
    url: "https://u1.ct.sendgrid.net/ls/click?upn=abc",
    via: "hiring.cafe",
  });
  assert.equal(second.company, "Globex");
});

test("Slug-Kandidaten ohne Rechtsform und ohne zu kurzes erstes Wort", () => {
  assert.deepEqual(slugCandidates("Acme Widgets Inc."), ["acmewidgets", "acme-widgets", "acme"]);
  assert.deepEqual(slugCandidates("SupplyHouse.com"), ["supplyhouse"]);
  assert.deepEqual(slugCandidates("US Mobile"), ["usmobile", "us-mobile"]);
});

test("Klare Ausschlüsse aus den Angaben der Mail", () => {
  const config = { salaryFloorEUR: 90_000, snippetKnockouts: [{ pattern: /security clearance/i, reason: "Sicherheitsfreigabe verlangt" }] };
  const [fits, low] = parseHiringCafe(plainText(EML));
  assert.equal(snippetExclusion(fits, config), null);
  assert.match(snippetExclusion(low, config), /Gehaltsband bis 85\.000/);
  assert.match(snippetExclusion({ ...low, salary: "" }, config), /Junior/);
  assert.equal(snippetExclusion({ ...fits, summary: "Active security clearance required." }, config), "Sicherheitsfreigabe verlangt");
});

test("Suchname auch ohne Einrückung, Fußzeile beendet die letzte Stelle", () => {
  const text = [
    "Payments PM",
    "Top 1 matches for you",
    "  1. Product Manager, Billing",
    "     Company: Initech",
    "     Requires 6+ years.",
    "",
    "How's your job search going?",
    "  You're receiving this email because you signed up.",
  ].join("\n");
  const [entry, ...rest] = parseHiringCafe(text);
  assert.equal(entry.search, "Payments PM");
  assert.equal(entry.summary, "Requires 6+ years.");
  assert.equal(rest.length, 0);
});

test("LinkedIn-Alert ergibt je Stelle Titel, Firma, Ort, Suche und einen Link ohne Token", () => {
  const text = [
    "Ihre Jobbenachrichtigung für Produktmanager in Köln            ",
    "Senior Product Manager, Billing (m/w/d)",
    "Initech",
    "Köln",
    "",
    "Dieses Unternehmen ist aktiv auf Personalsuche.",
    "Jobangebot ansehen: https://www.linkedin.com/comm/jobs/view/1234567/?trackingId=abc&otpToken=geheim",
    "",
    "---------------------------------------------------------",
    "",
    "Product Owner",
    "Globex",
    "Deutschland",
    "Jobangebot ansehen: https://www.linkedin.com/comm/jobs/view/7654321/?otpToken=geheim",
    "",
    "Diese E-Mail wurde an Sie gesendet.",
  ].join("\r\n");
  const [first, second, ...rest] = parseLinkedIn(text);
  assert.deepEqual(first, {
    title: "Senior Product Manager, Billing (m/w/d)",
    search: "Produktmanager",
    company: "Initech",
    location: "Köln",
    salary: "",
    summary: "",
    url: "https://www.linkedin.com/jobs/view/1234567/",
    via: "LinkedIn",
  });
  assert.equal(second.company, "Globex");
  assert.equal(second.location, "Deutschland");
  assert.equal(rest.length, 0);
});

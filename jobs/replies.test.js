const test = require("node:test");
const assert = require("node:assert/strict");
const { parseReply, pickJobs, extractRefs, decodeHeader } = require("./replies");

// Fiktive Gmail-Antwort auf eine Scanner-Mail: eigener Text, Zitatzeile, zitierte Mail mit weiteren Nummern.
const reply = (authResults) => [
  `Authentication-Results: mx.google.com;`,
  `       ${authResults}`,
  "From: Ben <ben@example.com>",
  "Subject: =?UTF-8?Q?Re:_Job-Scanner:_keine_Treffer_(bester_Score_66)?=",
  "Message-ID: <abc123@mail.gmail.com>",
  'Content-Type: multipart/alternative; boundary="b1"',
  "",
  "--b1",
  "Content-Type: text/plain; charset=UTF-8",
  "",
  "j12 und J15 bitte, J15 doppelt",
  "",
  "Am Fr., 7. Nov. 2026 um 07:31 Uhr schrieb <scanner@example.com>:",
  "",
  ">   J12 · 66 · Augustus · Product Manager",
  ">   J13 · 60 · Acme · Senior PM",
  "",
  "--b1--",
  "",
].join("\r\n");

test("Nur Nummern aus dem eigenen Text, nicht aus Zitat oder Zitatzeile", () => {
  const parsed = parseReply(reply("dkim=pass header.i=@example.com header.s=1 header.b=x;"), "ben@example.com");
  assert.deepEqual(parsed.refs, [12, 15]);
  assert.equal(parsed.messageId, "<abc123@mail.gmail.com>");
  assert.equal(parsed.subject, "Re: Job-Scanner: keine Treffer (bester Score 66)");
  assert.equal(parsed.signed, true);
});

test("Ohne gültige Signatur der Absenderdomain gilt die Antwort als nicht signiert", () => {
  assert.equal(parseReply(reply("dkim=fail header.i=@example.com"), "ben@example.com").signed, false);
  assert.equal(parseReply(reply("dkim=pass header.i=@example.com.evil.net"), "ben@example.com").signed, false);
  assert.equal(parseReply(reply("dkim=pass header.i=@other.com"), "ben@example.com").signed, false);
  // Mehrere Ergebnisse ohne Semikolon dazwischen, wie Gmail sie schreibt: das fehlgeschlagene zählt nicht.
  assert.equal(parseReply(reply("dkim=pass header.i=@other.com header.s=1 dkim=fail header.i=@example.com"), "ben@example.com").signed, false);
});

test("Nummern brauchen das J, Datum und Uhrzeit zählen nicht", () => {
  assert.deepEqual(extractRefs("CV für 12 bitte\nAm 7.11. um 07:31"), []);
  assert.deepEqual(extractRefs("J3,J4 J3"), [3, 4]);
});

test("Betreff in Base64 wird dekodiert", () => {
  const encoded = `=?UTF-8?B?${Buffer.from("Re: Job-Scanner: 1 von 2 CVs bereit (Café)").toString("base64")}?=`;
  assert.equal(decodeHeader(encoded), "Re: Job-Scanner: 1 von 2 CVs bereit (Café)");
});

// Antwort auf eine Statusmail aus der Zeit vor den Nummern.
const oldMailReply = (own) => ({
  own,
  urls: [
    "https://www.arbeitnow.com/jobs/companies/augustus/product-manager-berlin-199266",
    "https://jobs.ashbyhq.com/acme/1",
    "https://hiring.cafe/job/unbewertet",
  ],
});
const records = [
  { key: "a", company: "Augustus", title: "Product Manager", url: "https://www.arbeitnow.com/jobs/companies/augustus/product-manager-berlin-199266", score: 66 },
  { key: "b", company: "Acme GmbH", title: "Senior PM", url: "https://jobs.ashbyhq.com/acme/1", score: 60 },
  { key: "c", company: "Globex", title: "PM", url: "https://example.com/globex", score: 70 },
];

test("Alte Mail ohne Nummern: Firmenname oder Link im eigenen Text wählt die Stelle", () => {
  assert.deepEqual(pickJobs(oldMailReply("Augustus bitte"), records).chosen.map((r) => r.key), ["a"]);
  assert.deepEqual(pickJobs(oldMailReply("die hier: https://jobs.ashbyhq.com/acme/1."), records).chosen.map((r) => r.key), ["b"]);
  // Globex steht nicht in der zitierten Mail, die unbewertete Stelle nicht in den Scores.
  const none = pickJobs(oldMailReply("Globex und die erste"), records);
  assert.deepEqual(none.chosen, []);
  assert.deepEqual(none.offered.map((r) => r.key), ["a", "b"]);
});

test("Zitat-Links werden aus der Mail gelesen, der eigene Text getrennt", () => {
  const eml = reply("dkim=pass header.i=@example.com").replace(">   J13 · 60 · Acme · Senior PM", ">        https://jobs.ashbyhq.com/acme/1");
  const parsed = parseReply(eml, "ben@example.com");
  assert.ok(parsed.urls.includes("https://jobs.ashbyhq.com/acme/1"));
  assert.doesNotMatch(parsed.own, /ashbyhq/);
});

const test = require("node:test");
const assert = require("node:assert/strict");
const { parseReply, extractRefs, decodeHeader } = require("./replies");

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

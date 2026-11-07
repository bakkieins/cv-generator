// Antworten auf Scanner-Mails: Wer mit Stellennummern (z. B. „J12, J15“) antwortet, bekommt dafür einen CV,
// auch unter der Schwelle. Gelesen wird nur, was von der eigenen Empfängeradresse kommt und von deren
// Mailanbieter signiert ist (DKIM), damit Fremde keine Tailoring-Läufe auslösen.
const { imap, imapDate, plainText } = require("./alerts");

const SINCE_DAYS = 7;
const REF = /\bJ(\d{1,5})\b/gi;

function headerBlock(eml) {
  return eml.split(/\r?\n\r?\n/)[0].replace(/\r?\n[ \t]+/g, " ");
}

function header(eml, name) {
  return headerBlock(eml).match(new RegExp(`^${name}:\\s*(.*)$`, "im"))?.[1].trim() ?? "";
}

// Encoded Words aus Betreffzeilen (=?UTF-8?B?…?= und =?UTF-8?Q?…?=).
function decodeHeader(value) {
  return value
    .replace(/\?=\s+=\?/g, "?==?")
    .replace(/=\?([^?]+)\?([BQ])\?([^?]*)\?=/gi, (_, charset, encoding, text) =>
      encoding.toUpperCase() === "B"
        ? Buffer.from(text, "base64").toString("utf8")
        : Buffer.from(text.replace(/_/g, " ").replace(/=([0-9A-F]{2})/gi, (__, hex) => String.fromCharCode(parseInt(hex, 16))), "latin1").toString("utf8"));
}

// Nur der eigene Text über dem Zitat zählt, sonst würden die Nummern aus der zitierten Mail mitgelesen.
function ownText(body) {
  const lines = body.split(/\r?\n/);
  const quoteStart = lines.findIndex((line) => line.startsWith(">"));
  return (quoteStart === -1 ? lines : lines.slice(0, quoteStart)).join("\n");
}

function extractRefs(body) {
  return [...new Set([...ownText(body).matchAll(REF)].map((match) => Number(match[1])))];
}

function signedBy(eml, address) {
  const domain = address.split("@")[1].replace(/\./g, "\\.");
  return new RegExp(`dkim=pass\\s+header\\.i=@${domain}(?=[\\s;]|$)`, "i").test(header(eml, "Authentication-Results"));
}

function parseReply(eml, address) {
  const body = plainText(eml) || eml.split(/\r?\n\r?\n/).slice(1).join("\n\n");
  return {
    messageId: header(eml, "Message-ID"),
    subject: decodeHeader(header(eml, "Subject")),
    signed: signedBy(eml, address),
    refs: extractRefs(body),
  };
}

// Antworten auf Scanner-Mails, die noch nicht verarbeitet sind.
function readReplies(config, processedUids) {
  const since = imapDate(new Date(Date.now() - SINCE_DAYS * 24 * 60 * 60 * 1000));
  const result = imap(config, config.alerts.imapUrl, `UID SEARCH FROM "${config.mail.to}" SUBJECT "Job-Scanner" SINCE ${since}`);
  const uids = (result.match(/^\* SEARCH ([\d ]*)/m)?.[1] ?? "").split(" ").filter(Boolean);
  return uids
    .filter((uid) => !processedUids.includes(uid))
    .map((uid) => ({ uid, ...parseReply(imap(config, `${config.alerts.imapUrl};UID=${uid}`), config.mail.to) }));
}

module.exports = { readReplies, parseReply, extractRefs, decodeHeader };

const fs = require("node:fs");
const path = require("node:path");
const { execFileSync } = require("node:child_process");

function keychainPassword({ keychainService, from }) {
  try {
    // Google zeigt App-Passwörter in Vierergruppen an. Die Leerzeichen gehören nicht dazu.
    return execFileSync("security", ["find-generic-password", "-s", keychainService, "-a", from, "-w"], {
      encoding: "utf8",
    }).replace(/\s+/g, "");
  } catch {
    throw new Error(
      `No SMTP password in Keychain. Add a Gmail app password with:\n` +
        `  security add-generic-password -s ${keychainService} -a ${from} -w`,
    );
  }
}

const encodeHeader = (value) => `=?UTF-8?B?${Buffer.from(value).toString("base64")}?=`;
const wrap = (base64) => base64.replace(/.{76}/g, "$&\r\n");

function buildMessage({ from, to, subject, text, attachments = [] }) {
  const boundary = `jobscan-${Date.now().toString(36)}`;
  const parts = [
    [
      `--${boundary}`,
      "Content-Type: text/plain; charset=UTF-8",
      "Content-Transfer-Encoding: base64",
      "",
      wrap(Buffer.from(text).toString("base64")),
    ].join("\r\n"),
    ...attachments.map((file) =>
      [
        `--${boundary}`,
        `Content-Type: application/pdf; name="${path.basename(file)}"`,
        "Content-Transfer-Encoding: base64",
        `Content-Disposition: attachment; filename="${path.basename(file)}"`,
        "",
        wrap(fs.readFileSync(file).toString("base64")),
      ].join("\r\n"),
    ),
  ];
  return [
    `From: ${from}`,
    `To: ${to}`,
    `Subject: ${encodeHeader(subject)}`,
    `Date: ${new Date().toUTCString()}`,
    "MIME-Version: 1.0",
    `Content-Type: multipart/mixed; boundary="${boundary}"`,
    "",
    ...parts,
    `--${boundary}--`,
    "",
  ].join("\r\n");
}

function sendMail(config, message, tmpDir) {
  const password = keychainPassword(config);
  const emlPath = path.join(tmpDir, `mail-${Date.now()}.eml`);
  fs.writeFileSync(emlPath, buildMessage({ from: config.from, to: config.to, ...message }));
  try {
    // Zugangsdaten über stdin, damit sie nicht in der Prozessliste auftauchen.
    execFileSync(
      "curl",
      ["--silent", "--show-error", "--ssl-reqd", "--url", config.smtpUrl, "--mail-from", config.from,
        "--mail-rcpt", config.to, "--upload-file", emlPath, "--config", "-"],
      { input: `user = "${config.from}:${password}"\n`, stdio: ["pipe", "inherit", "inherit"] },
    );
  } finally {
    fs.rmSync(emlPath, { force: true });
  }
}

module.exports = { sendMail, keychainPassword };

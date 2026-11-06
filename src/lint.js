// CLI: npm run lint:cv
// Stilregeln aus CLAUDE.md für Summary, Firmenköpfe und Bullets aller CV-Daten.
const fs = require("node:fs");
const path = require("node:path");
const { ROOT, APPLICATIONS_DIR, PUBLIC_SAMPLE, MASTERS, applicationNames } = require("./data");
const publicConfig = require("./lint.config");

// Verbotene Begriffe und Prüfwerte für die EN/DE-Drift bleiben privat.
function loadConfig() {
  const privatePath = path.join(ROOT, "private", "lint.config.js");
  const privateConfig = fs.existsSync(privatePath) ? require(privatePath) : {};
  const terms = [
    ...publicConfig.forbiddenTerms,
    ...(privateConfig.forbiddenTerms ?? []),
    ...(privateConfig.internalTeamNames ?? []),
  ];
  const escape = (term) => term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return {
    maxBulletCharacters: publicConfig.maxBulletCharacters,
    forbidden: terms.map((term) => ({ term, pattern: new RegExp(`\\b${escape(term)}\\b`, "i") })),
    masterDrift: privateConfig.masterDrift,
  };
}

function sources() {
  return [
    { file: PUBLIC_SAMPLE, label: "public sample" },
    { file: MASTERS.en, label: "English master", driftKey: "english" },
    { file: MASTERS.de, label: "German master", driftKey: "german" },
    ...applicationNames().map((name) => ({ file: path.join(APPLICATIONS_DIR, name, "data.js"), label: name })),
  ].filter((source) => fs.existsSync(source.file));
}

const DATE_RANGE = /\b(?:\d{2}\/\d{4}|\d{4})\s*[–—-]\s*(?:\d{2}\/\d{4}|\d{4}|heute|today|present)\b/gi;

const contentOf = (data) => [
  ...(typeof data.summary === "string" ? [{ where: "summary", text: data.summary }] : []),
  ...Object.entries(data.employers ?? {}).map(([company, { note = "" }]) => ({ where: `employer ${company}`, text: note })),
  ...data.experience.flatMap((job, jobIndex) =>
    job.bullets.map((text, bulletIndex) => ({ where: `role ${jobIndex + 1}, bullet ${bulletIndex + 1}`, text, isBullet: true })),
  ),
  ...(data.projects ?? []).flatMap((project, projectIndex) =>
    project.bullets.map((text, bulletIndex) => ({ where: `project ${projectIndex + 1}, bullet ${bulletIndex + 1}`, text, isBullet: true })),
  ),
];

function check(label, content, config) {
  const errors = [];
  const warnings = [];
  for (const { where, text, isBullet } of content) {
    const location = `${label}: ${where}`;
    if (/[–—]/.test(text.replace(DATE_RANGE, ""))) errors.push(`${location}: narrative dash found`);
    for (const { term, pattern } of config.forbidden) {
      if (pattern.test(text)) errors.push(`${location}: forbidden term "${term}" found`);
    }
    if (!isBullet) continue;
    if (/\.\s*$/.test(text)) errors.push(`${location}: bullet ends with a period`);
    if (/\bPO\b/.test(text)) errors.push(`${location}: use "PM", not "PO"`);
    if (text.length > config.maxBulletCharacters) {
      warnings.push(`${location}: ${text.length} characters (limit ${config.maxBulletCharacters})`);
    }
  }
  return { errors, warnings };
}

// Verifizierte Kernzahlen müssen in beiden Mastern stehen.
function checkDrift(label, content, patterns = []) {
  const fullText = content.map((item) => item.text).join("\n");
  return patterns
    .filter(([, pattern]) => !pattern.test(fullText))
    .map(([fact]) => `${label}: expected verified fact "${fact}" is missing`);
}

function main() {
  const config = loadConfig();
  const list = sources();
  const errors = [];
  const warnings = [];
  for (const source of list) {
    const content = contentOf(require(source.file));
    const result = check(source.label, content, config);
    errors.push(...result.errors);
    warnings.push(...result.warnings);
    if (source.driftKey && config.masterDrift) {
      errors.push(...checkDrift(source.label, content, config.masterDrift[source.driftKey]));
    }
  }

  for (const warning of warnings) console.warn(`⚠ ${warning}`);
  for (const error of errors) console.error(`✗ ${error}`);
  if (errors.length) {
    process.exitCode = 1;
    return;
  }
  console.log(`CV lint passed (${list.length} source${list.length === 1 ? "" : "s"}).`);
}

main();

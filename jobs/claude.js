// Aufruf von Claude Code im Headless-Modus mit strukturiertem Ergebnis.
const fs = require("node:fs");
const path = require("node:path");
const { execFileSync } = require("node:child_process");

const ROOT = path.join(__dirname, "..");

function renderPrompt(name, values) {
  const template = fs.readFileSync(path.join(__dirname, "prompts", `${name}.md`), "utf8");
  return template.replace(/{{(\w+)}}/g, (_, key) => values[key] ?? "");
}

function runClaude({ prompt, model, budget, schema, tools, permissionMode, agent }) {
  const output = execFileSync(
    "claude",
    [
      "-p", prompt,
      ...(agent ? ["--agent", agent] : []),
      "--model", model,
      "--output-format", "json",
      "--json-schema", JSON.stringify(schema),
      "--max-budget-usd", String(budget),
      "--no-session-persistence",
      "--allowedTools", ...tools,
      ...(permissionMode ? ["--permission-mode", permissionMode] : []),
    ],
    { cwd: ROOT, encoding: "utf8", maxBuffer: 50 * 1024 * 1024, timeout: 30 * 60 * 1000 },
  );
  const result = JSON.parse(output);
  if (result.is_error || !result.structured_output) {
    throw new Error(`claude returned ${result.subtype}: ${String(result.result).slice(0, 300)}`);
  }
  return { ...result.structured_output, costUSD: result.total_cost_usd };
}

const stringList = { type: "array", items: { type: "string" } };

const SCORE_SCHEMA = {
  type: "object",
  properties: {
    score: { type: "integer", minimum: 0, maximum: 100 },
    breakdown: {
      type: "object",
      properties: {
        role: { type: "integer" },
        skills: { type: "integer" },
      },
      required: ["role", "skills"],
    },
    verdict: { type: "string" },
    strengths: stringList,
    gaps: stringList,
    knockouts: stringList,
    language: { type: "string", enum: ["en", "de"] },
    liveVerified: { type: "boolean" },
    jobText: { type: "string" },
  },
  required: ["score", "breakdown", "verdict", "strengths", "gaps", "knockouts", "language", "liveVerified", "jobText"],
};

const TAILOR_SCHEMA = {
  type: "object",
  properties: {
    status: { type: "string", enum: ["ready", "failed"] },
    pdfPath: { type: "string" },
    changes: { type: "string" },
    openQuestions: stringList,
    notes: { type: "string" },
  },
  required: ["status", "pdfPath", "changes", "openQuestions", "notes"],
};

const REVIEW_SCHEMA = {
  type: "object",
  properties: {
    release: { type: "boolean" },
    blocking: {
      type: "array",
      items: {
        type: "object",
        properties: { where: { type: "string" }, issue: { type: "string" }, fix: { type: "string" } },
        required: ["where", "issue", "fix"],
      },
    },
    review: {
      type: "array",
      items: {
        type: "object",
        properties: {
          where: { type: "string" },
          verdict: { type: "string", enum: ["behalten", "umschreiben", "streichen"] },
          note: { type: "string" },
        },
        required: ["where", "verdict", "note"],
      },
    },
    openQuestions: stringList,
  },
  required: ["release", "blocking", "review", "openQuestions"],
};

module.exports = { renderPrompt, runClaude, SCORE_SCHEMA, TAILOR_SCHEMA, REVIEW_SCHEMA };

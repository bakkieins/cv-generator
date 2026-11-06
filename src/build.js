// CLI: npm run cv -- <data-name> <Firma> [de]
// Baut DOCX und PDF nach output/ und prüft die Seitenzahl.
const fs = require("node:fs");
const path = require("node:path");
const { execFileSync } = require("node:child_process");
const { OUTPUT_DIR, MASTERS, resolveData, inferLocale } = require("./data");
const renderer = require("./renderer");

const FILE_PREFIX = "Benjamin_Backwinkel_CV";

function dateStamp(date) {
  const pad = (value) => String(value).padStart(2, "0");
  return `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}`;
}

function safeCompanyName(company) {
  const name = company
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-zA-Z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
  if (!name) {
    throw new Error("Company name must contain at least one letter or number.");
  }
  return name;
}

// EN = 1 Seite, DE = 2 Seiten. Der EN-Master ist als Content-Pool bewusst zweiseitig.
const expectedPages = (locale, dataPath) => (locale === "de" || dataPath === MASTERS.en ? 2 : 1);

function convertToPdf(docxPath) {
  execFileSync("soffice", ["--headless", "--convert-to", "pdf", "--outdir", OUTPUT_DIR, docxPath], { stdio: "inherit" });
  const pdfPath = docxPath.replace(/\.docx$/, ".pdf");
  if (!fs.existsSync(pdfPath)) {
    throw new Error(`PDF conversion did not create the expected file: ${pdfPath}`);
  }
  return pdfPath;
}

function pageCount(pdfPath) {
  const match = execFileSync("pdfinfo", [pdfPath], { encoding: "utf8" }).match(/^Pages:\s+(\d+)\s*$/m);
  if (!match) {
    throw new Error(`Could not read the page count from pdfinfo for ${pdfPath}.`);
  }
  return Number(match[1]);
}

async function main() {
  const args = process.argv.slice(2);
  const [dataName, company, requestedLocale] = args;
  if (args.length < 2 || args.length > 3 || !dataName || !company) {
    throw new Error("Usage: npm run cv -- <data-name> <company> [de]");
  }

  const { data, dataPath } = resolveData(dataName);
  const locale = requestedLocale ?? inferLocale(data);
  if (!["en", "de"].includes(locale)) {
    throw new Error(`Unsupported locale "${requestedLocale}". Use "en" or "de".`);
  }

  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  const docxPath = path.join(OUTPUT_DIR, `${dateStamp(new Date())}_${FILE_PREFIX}_${safeCompanyName(company)}.docx`);
  await renderer.generate(data, docxPath, locale);
  const pdfPath = convertToPdf(docxPath);

  const actual = pageCount(pdfPath);
  const expected = expectedPages(locale, dataPath);
  if (actual !== expected) {
    throw new Error(`${pdfPath} has ${actual} page(s); expected ${expected} for locale "${locale}".`);
  }
  console.log(`✅  PDF verified (${actual} page${actual === 1 ? "" : "s"}) → ${pdfPath}`);
}

main().catch((error) => {
  console.error(`✗ ${error.message}`);
  process.exitCode = 1;
});

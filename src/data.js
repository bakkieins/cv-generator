// Wo CV-Daten liegen und wie sie gefunden werden. Gemeinsam für Build, Build-All und Lint.
const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.join(__dirname, "..");
const OUTPUT_DIR = path.join(ROOT, "output");
const APPLICATIONS_DIR = path.join(ROOT, "applications");
const PUBLIC_SAMPLE = path.join(ROOT, "data_public.js");
const MASTERS = {
  en: path.join(ROOT, "private", "data_us.js"),
  de: path.join(ROOT, "private", "data_de.js"),
};

// Suchreihenfolge: Bewerbung, privater Master, öffentliche Beispieldaten im Repo-Root.
function resolveData(name) {
  if (name.includes("/") || name.includes("\\") || name === "." || name === "..") {
    throw new Error("Data name must be a simple file or application name.");
  }
  const candidates = [
    path.join(APPLICATIONS_DIR, name, "data.js"),
    path.join(ROOT, "private", `${name}.js`),
    path.join(ROOT, `${name}.js`),
  ];
  const dataPath = candidates.find((candidate) => fs.existsSync(candidate));
  if (!dataPath) {
    throw new Error(
      `Could not find data "${name}". Checked applications/${name}/data.js, private/${name}.js, and ${name}.js.`,
    );
  }
  return { data: require(dataPath), dataPath };
}

// Ordnernamen aller Bewerbungen mit Tailoring-Datei.
function applicationNames() {
  if (!fs.existsSync(APPLICATIONS_DIR)) return [];
  return fs.readdirSync(APPLICATIONS_DIR, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && fs.existsSync(path.join(APPLICATIONS_DIR, entry.name, "data.js")))
    .map((entry) => entry.name);
}

// Nur deutsche Daten haben „Persönliche Daten".
const inferLocale = (data) => (data.personal?.details ? "de" : "en");

module.exports = { ROOT, OUTPUT_DIR, APPLICATIONS_DIR, PUBLIC_SAMPLE, MASTERS, resolveData, applicationNames, inferLocale };

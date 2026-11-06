// CLI: npm run build:all
// Regressionstest nach Renderer-Änderungen: beide Master plus jede Bewerbung.
const path = require("node:path");
const { execFileSync } = require("node:child_process");
const { ROOT, applicationNames } = require("./data");

const builds = [
  ["data_us", "Master_EN"],
  ["data_de", "Master_DE", "de"],
  ...applicationNames().map((name) => [name, name]),
];

for (const args of builds) {
  console.log(`\nBuilding ${args[0]}...`);
  execFileSync(process.execPath, [path.join(__dirname, "build.js"), ...args], { cwd: ROOT, stdio: "inherit" });
}

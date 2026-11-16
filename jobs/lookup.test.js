const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const config = require("./jobs.config");
const { lookupAlerts, isBlocked, toJob, validResult } = require("./lookup");

const entry = { company: "Example Corp", title: "Senior Product Manager, Billing (m/w/d)", location: "Berlin", salary: "", via: "LinkedIn", search: "Billing" };
const text = "Aufgaben und Anforderungen ".repeat(20);

test("Jobbörsen und Aggregatoren zählen nie als Fundstelle", () => {
  for (const url of ["https://www.linkedin.com/jobs/view/1/", "https://de.linkedin.com/jobs/view/1", "https://hiring.cafe/job/1", "https://de.indeed.com/viewjob?jk=1", "kein-link"]) {
    assert.equal(isBlocked(url), true, url);
  }
  assert.equal(isBlocked("https://example.wd5.myworkdayjobs.com/careers/job/Koeln/Senior-PM_R1"), false);
});

test("Ein Treffer braucht Link und echten Anzeigentext", () => {
  assert.equal(validResult({ found: true, url: "https://jobs.example.com/1", description: text }), true);
  assert.equal(validResult({ found: true, url: "https://jobs.example.com/1", description: "kurz" }), false);
  assert.equal(validResult({ found: true, url: "https://www.linkedin.com/jobs/view/1/", description: text }), false);
  assert.equal(validResult({ found: false, url: "https://jobs.example.com/1", description: text }), false);
});

test("Treffer werden zur normalen Stelle mit stabilem Schlüssel", () => {
  const job = toJob(entry, { url: "https://jobs.example.com/1", description: text, title: "", postedAt: "unbekannt" }, "2026-11-16T07:00:00.000Z");
  assert.equal(job.key, "web:examplecorp:seniorproductmanagerbilling");
  assert.equal(job.title, entry.title);
  assert.equal(job.postedAt, "2026-11-16T07:00:00.000Z");
  assert.equal(job.source, "web");
});

test("Ohne Suche (Testlauf) warten neue Stellen, frühere Treffer kommen zurück, Fehlschläge gehen in die Liste", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "lookup-"));
  const now = Date.parse("2026-11-16T07:00:00.000Z");
  const at = new Date(now - 2 * 24 * 60 * 60 * 1000).toISOString();
  const found = { ...entry, title: "Product Manager, Payments" };
  const missed = { ...entry, title: "Product Manager, Platform" };
  fs.writeFileSync(path.join(dir, "lookups.json"), JSON.stringify({
    results: {
      "examplecorp:productmanagerpayments": { at, found: true, entry: found, job: toJob(found, { url: "https://jobs.example.com/2", description: text }, at) },
      "examplecorp:productmanagerplatform": { at, found: false, entry: missed, reason: "nur Übersicht gefunden" },
    },
    pending: [],
  }));

  const result = await lookupAlerts([entry, found, missed], config, dir, { search: false, now });
  assert.deepEqual(result.jobs.map((job) => job.url), ["https://jobs.example.com/2"]);
  assert.deepEqual(result.notFound.map((e) => e.lookup), ["nur Übersicht gefunden"]);
  assert.deepEqual(result.pending.map((e) => e.title), [entry.title]);
  assert.equal(result.searched, 0);
  // Wartende und gefundene Stellen dürfen nicht als gesehen markiert werden, der Fehlschlag schon.
  assert.deepEqual([...result.deferred].sort(), ["examplecorp:productmanagerpayments", "examplecorp:seniorproductmanagerbilling"]);
});

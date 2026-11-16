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

test("Ohne Fund ein zweiter Versuch am nächsten Tag, danach verworfen; Treffer kommen aus dem Speicher zurück", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "lookup-"));
  const now = Date.parse("2026-11-16T07:00:00.000Z");
  const hoursAgo = (h) => new Date(now - h * 60 * 60 * 1000).toISOString();
  const found = { ...entry, title: "Product Manager, Payments" };
  const once = { ...entry, title: "Product Manager, Platform" };
  const recent = { ...entry, title: "Product Manager, APIs" };
  const twice = { ...entry, title: "Product Manager, Pricing" };
  fs.writeFileSync(path.join(dir, "lookups.json"), JSON.stringify({
    results: {
      "examplecorp:productmanagerpayments": { at: hoursAgo(48), found: true, entry: found, job: toJob(found, { url: "https://jobs.example.com/2", description: text }, hoursAgo(48)) },
      "examplecorp:productmanagerplatform": { at: hoursAgo(24), found: false, attempts: 1, entry: once, reason: "noch nicht indexiert" },
      "examplecorp:productmanagerapis": { at: hoursAgo(2), found: false, attempts: 1, entry: recent, reason: "noch nicht indexiert" },
      "examplecorp:productmanagerpricing": { at: hoursAgo(30), found: false, attempts: 2, entry: twice, reason: "nur Aggregator" },
    },
    pending: [once, recent],
  }));

  // Testlauf ohne Suche: Zweitversuch und neue Stelle warten, der Treffer kommt zurück, der zweite Fehlschlag fällt raus.
  const result = await lookupAlerts([entry, twice], config, dir, { search: false, now });
  assert.deepEqual(result.jobs.map((job) => job.url), ["https://jobs.example.com/2"]);
  assert.deepEqual(result.dropped.map((e) => e.title), [twice.title]);
  assert.deepEqual(result.pending.map((e) => e.title).sort(), [entry.title, once.title, recent.title].sort());
  assert.equal(result.searched, 0);
  // Wartende und gefundene Stellen dürfen nicht als gesehen markiert werden, verworfene schon.
  assert.equal(result.deferred.has("examplecorp:productmanagerpricing"), false);
  assert.equal(result.deferred.has("examplecorp:productmanagerpayments"), true);
  assert.equal(result.deferred.has("examplecorp:seniorproductmanagerbilling"), true);
});

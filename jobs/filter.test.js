const test = require("node:test");
const assert = require("node:assert/strict");
const config = require("./jobs.config");
const { prefilter, passesTitle, passesLocation } = require("./filter");

test("Plattform-Titel kommen durch den Titelfilter", () => {
  for (const title of [
    "Senior Product Manager, Internal Platform",
    "Product Manager, Salesforce Platform",
    "Product Manager - Platform Engineering",
    "Staff Product Manager, Developer Experience",
    "Product Director, Financial Platform",
    "Director of Product, API Platform",
    "Senior PM, Payments Infrastructure",
    "Product Owner Plattform (m/w/d)",
  ]) {
    assert.ok(passesTitle(title, config), title);
  }
});

test("Unpassende Titel fallen raus", () => {
  for (const title of [
    "Associate Product Manager",
    "Junior Product Manager",
    "Product Manager Intern",
    "Head of Product Marketing",
    "Account Executive, Product Sales",
    "Senior Product Analyst",
    "Product Designer, Platform",
    "Software Engineer, Platform",
    "Director, Product Design",
    "Director, Product Legal (EmFi & Payments)",
  ]) {
    assert.ok(!passesTitle(title, config), title);
  }
});

test("Nur ein Arbeitsmodell statt eines Orts zählt als unbekannter Ort", () => {
  const strict = { locationInclude: /berlin/i, locationExclude: /^$/ };
  for (const location of ["", "Hybrid", "Hybrid; In-Office", "In-Office", "N/A", "Berlin · Hybrid"]) {
    assert.ok(passesLocation(location, strict), location);
  }
  for (const location of ["London · Hybrid", "Amsterdam"]) {
    assert.ok(!passesLocation(location, strict), location);
  }
});

test("Fokus-Quellen liefern nur Plattform- und Monetarisierungs-Stellen", () => {
  const now = Date.parse("2026-11-02");
  const job = (key, title) => ({ key, company: "Acme", title, location: "Remote", postedAt: "2026-11-01", focus: true });
  const { candidates } = prefilter(
    [
      job("a", "Principal Product Manager, Enterprise AI"),
      job("b", "Website Product Manager"),
      job("c", "Staff Product Manager, Metering and Attribution"),
      job("d", "Senior Product Manager, Payments"),
      job("e", "Product Manager, Developer Platform"),
    ],
    { ...config, maxAgeDays: 14 },
    {},
    now,
  );
  assert.deepEqual(candidates.map((c) => c.key).sort(), ["c", "d", "e"]);
});

test("Gleiche Stelle mit anderem Gender-Zusatz zählt einmal", () => {
  const now = Date.parse("2026-11-02");
  const job = (key, title) => ({ key, company: "Acme", title, location: "Remote", postedAt: "2026-11-01" });
  const { unique } = prefilter(
    [
      job("a", "Product Manager Energy Markets (m/f/d)"),
      job("b", "Product Manager Energy Markets (m/w/d)"),
      job("c", "Product Owner (m|w|d)"),
      job("d", "Product Owner (all genders)"),
      job("e", "Director, Product Legal (EmFi & Payments)"),
    ],
    { ...config, maxAgeDays: 14 },
    {},
    now,
  );
  assert.equal(unique.length, 3);
});

test("Plattform-Stellen stehen vor neueren Nicht-Plattform-Stellen", () => {
  const now = Date.parse("2026-11-02");
  const job = (id, title, postedAt) => ({ key: id, company: "Acme", title, location: "Remote", postedAt });
  const { candidates } = prefilter(
    [
      job("a", "Senior Product Manager, Checkout", "2026-11-01"),
      job("b", "Senior Product Manager, API Platform", "2026-10-25"),
      job("c", "Product Manager, Growth", "2026-10-30"),
    ],
    { ...config, maxAgeDays: 14 },
    {},
    now,
  );
  assert.deepEqual(candidates.map((c) => c.key), ["b", "a", "c"]);
});

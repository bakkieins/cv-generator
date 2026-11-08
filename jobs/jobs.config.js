// Öffentliche Defaults. Echte Watchlist, Schwelle und Mail-Adresse in private/jobs.config.js.
module.exports = {
  threshold: 75,
  maxAgeDays: 14,
  maxScoresPerRun: 20,
  maxTailorsPerRun: 3,
  // Per Antwort angeforderte CVs pro Lauf, der Rest folgt im nächsten Lauf.
  maxRequestsPerRun: 3,
  // Stellen unter der Schwelle stehen ab diesem Score mit Nummer in der Mail, mindestens die drei besten.
  listMinScore: 50,
  // Zeitplan in Worten für Antwortmails, wie in jobs/install-launchd.sh eingerichtet.
  scheduleNote: "Mo–Sa 07:30, Mo–Fr zusätzlich 13:30 und 21:30, So 21:30",
  salaryFloorEUR: null,
  // Persönliche Score-Regeln bleiben privat (private/jobs.config.js): wie Standort und Arbeitsmodell zählen,
  // zusätzliche Knockouts für den Score-Prompt und Muster für klare Ausschlüsse aus Alert-Mails.
  locationPolicy: "Standort, Arbeitsmodell und Gehalt fließen nicht in den Score ein.",
  knockoutRules: [],
  snippetKnockouts: [], // [{ pattern: /…/i, reason: "…" }]
  models: { score: "sonnet", tailor: "opus", review: "opus" },
  maxFixRounds: 2,
  budgetUSD: { score: 0.5, tailor: 4, review: 1.5 },

  titleInclude: /product manager|produktmanager|product lead|head of product|product owner|product director|director,? (of )?product\b(?!\s+(design|legal|marketing|operations|analytics))|\bpm\b/i,
  // Wortgrenzen, damit „Internal Platform", „Salesforce" und „Platform Engineering" nicht rausfallen.
  titleExclude: /junior|associate|\bintern(ship)?\b|praktik|werkstudent|working student|product marketing|marketing manager|\bdesigner\b|\banalyst\b|\bengineer\b|\bsales\b|account manager/i,
  locationInclude: /./,
  locationExclude: /remote\s*[-–(,]?\s*(us|usa|united states|canada|north america|americas)\b|\bus[- ]remote/i,

  excludeCompanies: [],
  flagCompanies: [],
  sources: [],

  mail: null,
  // Alert-Mails von Jobbörsen im Scanner-Postfach, z. B. { imapUrl: "imaps://imap.gmail.com:993/INBOX", senders: ["hiring.cafe"] }.
  alerts: null,
};

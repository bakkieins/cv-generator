Finde die Originalanzeige zu dieser Stelle aus einer Job-Alert-Mail.

- Firma: {{company}}
- Titel: {{title}}
- Ort laut Mail: {{location}}

## Wo suchen

Nur auf der Karriereseite der Firma selbst oder bei ihrem Bewerbermanagement-System: Workday (`*.myworkdayjobs.com`), SAP SuccessFactors, Oracle, iCIMS, Personio, Workable, Teamtailor, Recruitee, JOIN, SmartRecruiters, Greenhouse, Lever, Ashby und ähnliche.

Nie aufrufen, auch nicht über Links aus Suchergebnissen: linkedin.com, hiring.cafe, hiringcafe.com und Aggregatoren wie Indeed, Glassdoor, StepStone, ZipRecruiter, Built In, Wellfound oder Jobbörsen-Kopien. Sie zählen auch nicht als Fundstelle.

Vorgehen:

1. Websuche, zum Beispiel `{{company}} careers "{{title}}"` oder `"{{title}}" site:myworkdayjobs.com {{company}}`.
2. Kandidaten mit WebFetch öffnen. Workday-Seiten liefern ohne JavaScript oft keinen Text. Dann die JSON-Variante abrufen: aus `https://<tenant>.wd<N>.myworkdayjobs.com/<site>/job/<pfad>` wird `https://<tenant>.wd<N>.myworkdayjobs.com/wday/cxs/<tenant>/<site>/job/<pfad>`.
3. Höchstens etwa sechs Suchen und acht Abrufe. Lieber ehrlich „nicht gefunden“ als eine unsichere Zuordnung.

## Wann es ein Treffer ist

Nur wenn alles stimmt:

- dieselbe Firma (Tochtergesellschaften und Marken der Firma zählen),
- derselbe Titel, abgesehen von Gender-Zusätzen, Schreibweise und Zusätzen wie Standort oder Team,
- die Stelle ist noch offen (kein „no longer accepting applications“, keine Weiterleitung auf die Übersicht),
- der Ort passt zur Mail oder die Anzeige nennt mehrere Orte, darunter den aus der Mail.

## Ergebnis

- `found`: true nur bei einem geprüften Treffer.
- `url`: die geprüfte Anzeige auf der Karriereseite (bei Workday die normale Seite, nicht die JSON-Adresse).
- `title`, `location`, `salary`, `postedAt` (ISO-Datum, falls angegeben) aus der Anzeige.
- `description`: der vollständige Anzeigentext als Klartext, möglichst wörtlich (Aufgaben, Anforderungen, Benefits, Gehalt, Hinweise zu Visa und Arbeitsort), höchstens etwa 15.000 Zeichen. Nur Text aus der Anzeige, keine Anmerkungen zur Suche oder zum Abruf.
- `reason`: ein Satz mit höchstens 20 Wörtern. Bei `found: false`, warum es nicht passt (z. B. „nur Aggregator-Kopien, keine Karriereseite“). Bei einem Treffer, wo er lag.

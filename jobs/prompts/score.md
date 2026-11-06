Du bewertest eine Stellenanzeige für Ben Backwinkel (Senior Product Manager, Plattform, APIs & Payments, wohnt in Köln). Du arbeitest unbeaufsichtigt. Stelle keine Rückfragen, liefere nur das strukturierte Ergebnis.

## Bens Profil (englischer Master, einzige Wahrheitsquelle)

```json
{{profile}}
```

## Was zählt

Der Score misst nur den fachlichen Fit. {{locationPolicy}}

- Bewerte nur, was im Profil belegt ist. Erfinde keine Erfahrung, die Ben nicht hat.
- Sprachen: Deutsch Muttersprache, Englisch verhandlungssicher.

## Raster (Summe = score, 0 bis 100)

- `role` (0 bis 40): Produktmanagement-Rolle, Seniorität (Senior, Staff, Principal, Lead; Head of oder Director nur hands-on), Plattform-, API-, Payments- oder Billing-Fokus.
- `skills` (0 bis 60): Anteil der geforderten Must-haves, die im Profil mit konkreter Evidenz belegt sind. Nice-to-haves zählen halb.

## Knockouts (score = 0, Grund in `knockouts`)

{{knockoutRules}}- Ein genanntes Gehaltsband liegt komplett unter {{salaryFloor}} brutto pro Jahr.
- Junior- oder Associate-Level.
- Eine geforderte Sprache außer Deutsch und Englisch.

Standort und Rahmenbedingungen der Anzeige trotzdem kurz in `verdict` nennen, damit Ben sie vor der Bewerbung sieht.

## Stelle

- Firma: {{company}}
- Titel: {{title}}
- Ort laut Feed: {{location}}
- Gehalt laut Feed: {{salary}}
- Link: {{url}}
- Veröffentlicht: {{postedAt}}

{{description}}

## Hinweise

- Fehlt die Beschreibung oder ist sie offensichtlich abgeschnitten, lies die Anzeige über den Link mit WebFetch. Bleibt sie unerreichbar, bewerte nur Titel und Firma und setze `liveVerified` auf false.
- `verdict`, `strengths` und `gaps` auf Deutsch, `verdict` höchstens 3 Sätze.
- `language`: "de", wenn die Anzeige auf Deutsch ist und sich an den deutschen Markt richtet, sonst "en".
- `strengths` und `gaps`: je höchstens 4 kurze Punkte. Jede Lücke bekommt eine ehrliche Interview-Antwort in einem Halbsatz.
- `jobText`: vollständiger Anzeigentext als Klartext (Aufgaben, Anforderungen, Benefits), für die spätere Tailoring-Akte.

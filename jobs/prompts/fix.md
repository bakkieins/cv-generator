Ein unabhängiger Review hat den CV für {{company}} · {{title}} nicht freigegeben. Korrigiere ihn unbeaufsichtigt. Halte dich an CLAUDE.md und CLAUDE.local.md. Stelle keine Rückfragen.

## Blockierende Funde

{{blocking}}

## Weitere Hinweise aus dem Review (optional)

{{review}}

## Schon bekannte offene Fragen

{{knownQuestions}}

## Ablauf

1. Arbeite jeden blockierenden Fund in `applications/{{slug}}/data.js` ab. Erlaubt sind nur Streichen, Abschwächen oder Zurücksetzen auf die Formulierung des Masters. Keine neuen Fakten, Zahlen oder Outcomes.
   Behandle jeden Fund als Muster, nicht als Einzelstelle: Bestimme, welche Behauptung zu stark ist (z. B. Verantwortung für etwas, das Ben nur geliefert hat), und suche dieselbe Behauptung im ganzen CV, in Header-Titel, Summary, allen Bullets und Skills, auch in anderer Wortform oder Sprache. Korrigiere jede Fundstelle. Der Review prüft danach erneut den ganzen CV und blockiert sonst die nächste Stelle mit demselben Problem.
   Nach jedem Streichen prüfen, ob jeder Skill und jede Aussage der Summary noch durch einen Bullet im CV gedeckt ist. Sonst den Skill bzw. die Aussage ebenfalls streichen.
2. Übernimm weitere Hinweise nur, wenn sie durch den Master gedeckt sind und die Seite nicht sprengen.
3. Bauen: `npm run cv -- {{slug}} "{{companyFile}}"{{localeArg}}`, dann `npm run lint:cv`.
4. Ergänze in `applications/{{slug}}/job.md` im Abschnitt „CV" kurz, was nach dem Review geändert wurde.

Ändere keine Dateien außerhalb von `applications/{{slug}}/`. Ergebnis wie beim Tailoring: `status` „ready" nur bei gebautem PDF mit korrekter Seitenzahl und fehlerfreiem Lint. `openQuestions` enthält nur Fragen, die durch diese Korrektur neu entstanden sind, nicht die schon bekannten. `changes`, `notes` und `openQuestions` auf Deutsch.

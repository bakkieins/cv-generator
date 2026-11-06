---
description: Neue Bewerbung anlegen, Match-Analyse, getailorten CV bauen
argument-hint: <firma> [de]
---
Neue Bewerbung für $ARGUMENTS.

1. Wenn noch nicht vorhanden: `applications/<firma>/job.md` aus `docs/templates/firma.md` anlegen und Ben nach der Stellenanzeige (Text oder Link) fragen.
2. Stelle live verifizieren (Karriereseite, Greenhouse, Ashby oder Personio direkt). Wenn nicht bestätigbar, klar sagen. Gegen die Verworfen-Liste in CLAUDE.local.md abgleichen.
3. Match-Analyse in job.md: Prozent, Stärken, Lücken mit ehrlicher Interview-Antwort, Empfehlung. Ortsbedingungen und Gehalt gegen die privaten Vorgaben in `CLAUDE.local.md` prüfen.
4. Bei Empfehlung „Bewerben": `applications/<firma>/data.js` per Spread auf `data_us` (EN) oder `data_de` (DE). Titel, Summary und Skills-Zeile 1 auf die Anzeige zuschneiden, Bullets nur umsortieren oder streichen, nie neue Fakten.
5. Bauen, Seitenzahl prüfen (EN 1, DE 2), bei Überlauf `[OPT]`-Bullets streichen. Projekte nur bei Plattform-, API-, TPM- oder AI-nahen Rollen behalten, sonst `projects: []` (dann auch „Claude Code" aus den Skills).
6. Subagent `cv-reviewer` mit PDF-Pfad und `applications/<firma>/data.js` beauftragen (frischer Kontext, nicht selbst reviewen). Blockierende Funde einarbeiten, neu bauen und erneut prüfen lassen. Ohne Freigabe kein PDF ausliefern.
7. PDF-Pfad nennen, Review-Ergebnis kurz in job.md festhalten und den Status setzen.

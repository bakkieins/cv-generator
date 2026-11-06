Erstelle unbeaufsichtigt einen getailorten CV für die folgende Stelle. Halte dich an CLAUDE.md und CLAUDE.local.md, vor allem an die harten Regeln für CV-Inhalte. Stelle keine Rückfragen. Wenn etwas offen bleibt, trage es als offene Frage ein, statt zu raten.

## Stelle

- Firma: {{company}}
- Titel: {{title}}
- Ort: {{location}}
- Link: {{url}}
- Sprache des CV: {{language}}
- Ordner: applications/{{slug}}/
- Match-Score: {{score}} / 100 ({{breakdown}})
- Stärken: {{strengths}}
- Lücken: {{gaps}}

Die Akte `applications/{{slug}}/job.md` mit Anzeigentext und Match-Analyse liegt schon an. Lies sie zuerst.

## Ablauf

1. Lege `applications/{{slug}}/data.js` an, per Spread auf den Master: `require("../../private/data_us")` für EN, `require("../../private/data_de")` für DE. Überschreibe nur geänderte Felder.
2. Zuschneiden:
   - Header-Titel „Senior Product Manager" plus Fokus passend zur Anzeige.
   - Summary auf die Anzeige zuschneiden, nur mit belegten Fakten aus dem Master.
   - Skills: die Domäne der Zielrolle in Zeile 1, Keywords aus der Anzeige verwenden, aber nur solche, die durch Bullets gedeckt sind.
   - Bullets nur umsortieren oder streichen (`[OPT]` zuerst). Formulierungen dürfen Keywords der Anzeige aufgreifen, aber keine neuen Fakten, Zahlen oder Outcomes einführen.
   - Location nach der Location-Regel in `CLAUDE.local.md`.
   - Projekte: nur bei Plattform-, API-, TPM- oder AI-nahen Rollen behalten, sonst `projects: []` (dann auch „Claude Code" aus den Skills).
3. Bauen: `npm run cv -- {{slug}} "{{companyFile}}"{{localeArg}}`. Das Script prüft die Seitenzahl (EN 1, DE 2). Bei Überlauf in dieser Reihenfolge kürzen und jeweils neu bauen, höchstens 6 Versuche:
   - `[OPT]`-Bullets streichen.
   - Bei Rollen ohne starken Plattform- oder AI-Bezug das Projekt streichen (`projects: []`).
   - Zusammengeführte oder umformulierte Bullets auf den kürzeren Master-Wortlaut zurücksetzen.
   - Den für die Anzeige schwächsten Bullet einer älteren Rolle streichen.
   Nach jedem Streichen prüfen, ob jeder Skill und jede Aussage der Summary noch durch einen Bullet im CV gedeckt ist. Sonst den Skill bzw. die Aussage ebenfalls streichen.
4. `npm run lint:cv` muss für diese Datei ohne Fehler durchlaufen.
5. Lies das PDF mit `pdftotext -layout` und prüfe selbst kurz, ob jede Aussage im Master belegt ist. Den Drei-Perspektiven-Review macht danach ein unabhängiger Reviewer. Diese Punkte hat der Reviewer bisher am häufigsten blockiert, prüfe sie vorher:
   - Jeder Skill hat einen Beleg in einem Bullet dieses CV, nicht nur im Master.
   - Keine Ownership- oder Präsens-Aussage zu Billing, Zuora oder Payments („I own", „I work on"), solange offene Frage 21 offen ist. Erlaubt ist die Master-Formulierung „My work spans".
   - Kein „B2B" an Billing-, Account- oder ARR-Zahlen: Migration und ARR betreffen B2C (offene Frage 14).
   - Bei Arbeitgebern in DE/EU Beträge nur in Euro, ohne Dollar-Umrechnung.
   - Der Header-Titel ist die stärkste Behauptung im CV: Fachgebiete darin brauchen denselben Beleg wie ein Bullet. Was Ben nur geliefert oder umgesetzt hat (z. B. Pricing & Packaging, Frage 4), gehört nicht als eigenes Fachgebiet in Titel oder Summary.
6. Ergänze in job.md: Abschnitt „CV" (Dateiname, Sprache, Besonderheiten) und offene Fragen. Status: „Offen, CV bereit, nicht beworben".

Bewirb dich nicht und sende nichts nach außen. Ändere keine Dateien außerhalb von `applications/{{slug}}/`.

Ergebnis: `status` ist „ready", wenn das PDF gebaut, die Seitenzahl geprüft und der Lint fehlerfrei ist. Sonst „failed" mit Grund in `notes`. `pdfPath` ist der absolute Pfad zum PDF in `output/`. `changes`, `notes` und `openQuestions` auf Deutsch, jede Frage nur einmal.

---
description: Einmaliges Onboarding nach setup-claude.sh, danach Roadmap und offene Fragen
---
Du übernimmst das CV-Generator-Projekt aus dem claude.ai-Projekt „Bewerbungen". Gehe so vor und halte Ben mit einer Task-Liste auf dem Laufenden.

## 1. Kontext laden
Lies CLAUDE.md, CLAUDE.local.md und private/roadmap.md vollständig. Fasse NICHT zusammen, was drinsteht, Ben kennt es.

## 2. Bestandsaufnahme (still, ohne Rückfragen)
- `git status`, `git log --oneline -20`, Dateiliste, `package.json`, `src/`, alle `data_*.js`.
- Unter `.setup-backup/` liegen Dateien, die das Setup-Script überschrieben hat. Prüfe, ob dort etwas Wertvolles drin ist, das nicht verloren gehen darf.
- Vergleiche den Repo-Stand mit `private/snapshot-20261102/` (Stand aus dem claude.ai-Projekt). Was ist neuer, Repo oder Snapshot? Pro Datei eine Zeile.
- Sind die `data_*.js` im Repo echt oder anonymisiert?
- Wurden personenbezogene Daten jemals committet? Suche mit `git log -S "<wert>" --oneline` nach Telefonnummer, Straße und Geburtsdatum aus `private/snapshot-20261102/data_de.js`. Wiederhole die Werte selbst nicht im Chat.
- Ist das Remote-Repo öffentlich? (`gh repo view --json visibility` falls `gh` da ist, sonst Ben fragen.)

## 3. Ben einmal kurz berichten und die eine wichtige Entscheidung abfragen
Höchstens 6 Zeilen Befund. Wenn personenbezogene Daten in der öffentlichen Historie stehen: mit AskUserQuestion fragen, ob das Repo auf privat gestellt oder die Historie bereinigt werden soll. Nichts davon ohne seine Antwort ausführen.

## 4. Roadmap A bis C umsetzen
Arbeite private/roadmap.md Abschnitt A, B, C ab. Ziel am Ende:
- `npm run cv -- data_us Example` und `npm run cv -- data_de Example de` bauen aus `private/`, erzeugen das PDF mit korrektem Namen in `output/`, prüfen die Seitenzahl.
- `npm run lint:cv` läuft grün über beide Masters, oder listet echte Funde.
- `npm run build:all` als Regressionstest.
Nach jedem Abschnitt: bauen, testen, kleiner Commit, Roadmap-Punkt abhaken. **Nicht pushen**, bevor Ben es freigibt. Vor dem ersten Push prüfen, dass `git ls-files` keine Datei aus `private/`, `applications/` oder `CLAUDE.local.md` enthält.

## 5. Offene Fragen klären
Stelle die offenen Fragen aus CLAUDE.local.md nacheinander, jeweils mit AskUserQuestion, wo sich sinnvolle Antwortoptionen anbieten, sonst als kurze Frage. Antworten sofort in CLAUDE.local.md eintragen (Fakten-Tabelle oder Attribution) und die Frage dort streichen. Erfinde nichts: Wenn Ben etwas nicht weiß, bleibt es offen.

Frage außerdem nach dem aktuellen Stand der Bewerbungen, deren Status in CLAUDE.local.md als veraltet markiert ist, und lege für laufende Prozesse `applications/<firma>/job.md` an.

## 6. Inhalt verbessern (Roadmap D)
Wende /review auf `private/data_us.js` und `private/data_de.js` an. Lege Ben die Vorschläge gesammelt vor, setze freigegebene um, gleiche EN und DE an, baue beide neu. Danach Liste, was Ben manuell ändern muss (LinkedIn usw.).

## 7. Abschluss
Kurz: was erledigt ist, was offen ist, nächster sinnvoller Schritt. Keine Wiederholung aller Einzelschritte.

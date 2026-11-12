# Job-Scanner

Scannt zu festen Zeiten (Mo–Sa 07:30, Mo–Fr zusätzlich 13:30 und 21:30, So 21:30, abgestimmt auf die Veröffentlichungswellen aus Europa und den USA) Karriereseiten (Greenhouse, Ashby, Lever, SmartRecruiters, Personio), die Jobsuche der Bundesagentur für Arbeit und die offene API von Arbeitnow, bewertet neue Stellen mit Claude nach fachlichem Fit (0 bis 100) und baut für Treffer über der Schwelle einen getailorten CV. Treffer kommen per Mail mit PDF im Anhang. Beworben wird nie automatisch.

## Ablauf

1. `sources.js` lädt alle Feeds aus `private/jobs.config.js`. `alerts.js` liest dazu neue Alert-Mails (hiring.cafe, LinkedIn) per IMAP aus dem Scanner-Postfach und sucht jede Stelle per Firmenname auf Greenhouse, Ashby, Lever und SmartRecruiters. Gefundene Stellen laufen durch denselben Ablauf. Der Rest kommt ohne Score als Liste zum Selbstprüfen in die Mail, nach Titel- und Ortsfilter und ohne klare Ausschlüsse aus der Kurzbeschreibung (Gehaltsband unter der Untergrenze, Junior, private Ausschlussmuster). Die Jobbörse selbst wird nie aufgerufen.
2. Vorfilter ohne KI (`filter.js`, Tests mit `npm test`): Titel, Region, Alter, verworfene Firmen aus `CLAUDE.local.md`, schon gesehene Stellen. Plattform- und API-Stellen werden zuerst bewertet, damit sie nicht am Limit pro Lauf hängen bleiben.
3. `prompts/score.md`: Bewertung mit Sonnet. Nur Rolle (40) und Skills (60) zählen, der Standort nicht. Knockouts aus der privaten Konfiguration ergeben 0.
4. Ab der Schwelle: `applications/<slug>/job.md` anlegen, dann `prompts/tailor.md` mit Opus (data.js, Build, Lint). Scheitert der Build an Seitenzahl oder Lint, folgt eine Rettungsrunde mit `prompts/fix.md`.
5. Unabhängiger Review mit dem Subagent `cv-reviewer` (`.claude/agents/cv-reviewer.md`, Opus, nur lesend). Ohne Freigabe eine Korrekturrunde (`prompts/fix.md`) und ein zweiter Review. Ohne Freigabe kein PDF-Anhang, die Funde stehen in Mail und `job.md`.
6. Mail über Gmail SMTP, Passwort aus dem macOS-Schlüsselbund. Bleibt der erste Lauf eines Tages ohne Treffer, kommt eine Statusmail mit den besten Scores seit der letzten Mail, damit Funkstille nie „Scanner steht“ bedeuten kann. Jede Stelle trägt eine feste Nummer (J12). Unter der Schwelle stehen die drei besten und alle ab `listMinScore` in der Mail.
7. CV auf Zuruf (`replies.js`): Eine Antwort auf eine Scanner-Mail mit Nummern („J12, J15“) löst für diese Stellen Tailoring und Review aus, auch unter der Schwelle. Das Ergebnis kommt als Antwort im selben Thread, freigegebene PDFs im Anhang. Auf ältere Mails ohne Nummern genügt der Firmenname oder Link im eigenen Text, sonst kommt eine Auswahl der Stellen aus dem Zitat mit Nummern zurück. Gelesen werden nur Antworten von der Empfängeradresse mit gültiger DKIM-Signatur ihrer Domain, nur der eigene Text über dem Zitat zählt. Höchstens `maxRequestsPerRun` CVs pro Lauf, der Rest bleibt in der Warteschlange. Ein eigener LaunchAgent prüft alle 2 Minuten (eine IMAP-Suche, ohne Antwort kein Claude-Aufruf).

## Dateien

| Datei | Zweck |
|---|---|
| `scan.js` | Einstiegspunkt: Optionen, Lock, Ablauf pro Lauf, State |
| `sources.js` | Feeds der ATS und Jobbörsen |
| `filter.js` | Vorfilter ohne KI |
| `alerts.js` | Alert-Mails per IMAP, Parser je Absender, Suche der Originalanzeige |
| `replies.js` | Antworten auf Scanner-Mails per IMAP, Stellennummern und Signatur prüfen |
| `pipeline.js` | Claude-Schritte: Bewerten, Tailoring, Rettungsrunde, Review, Korrektur |
| `claude.js` | Aufruf von `claude -p`, Prompt-Vorlagen, JSON-Schemas |
| `dossier.js` | Akte `applications/<slug>/job.md`, Slug und CV-Dateiname |
| `report.js` | Text der Treffer-, Status- und Antwortmail |
| `mail.js` | Versand über Gmail SMTP |

## Befehle

```bash
node jobs/scan.js --dry-run              # nur laden und filtern, ohne Claude
node jobs/scan.js --score-only --limit=3 # bewerten und ausgeben, State bleibt unverändert
node jobs/scan.js --test-mail            # Mailversand prüfen
node jobs/scan.js --replies              # nur Antworten mit angeforderten CVs abarbeiten
node jobs/scan.js --threshold=60 --no-mail
jobs/install-launchd.sh                  # zu festen Uhrzeiten einplanen, Antworten alle 2 Minuten
jobs/install-launchd.sh uninstall
```

State und Log liegen in `private/jobs-state/` (`seen.json`, `scores.jsonl` zum Justieren der Schwelle, `alerts.json` mit verarbeiteten Mails und gefundenen Boards je Firma, `requests.json` mit Stellennummern und Warteschlange, `candidates.json` mit den Score-Ergebnissen der letzten 60 Tage, `scan.log`).

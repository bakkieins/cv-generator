# CV Generator · Projektkontext für Claude Code

Lebenslauf-Generator für Ben Backwinkel (Senior Product Manager, Plattform, APIs & Payments).
Inhalt (`data_*.js`) und Layout (`src/renderer.js`) sind getrennt. Ausgabe: DOCX via docx.js, dann PDF via LibreOffice.

Private Fakten, Attribution und Bewerbungsstand stehen in `CLAUDE.local.md` (gitignored, wird automatisch mitgeladen).
Offene Verbesserungen: @private/roadmap.md (gitignored)

## Wahrheitsquelle

- Das Repo ist öffentlich. Echte CV-Daten (Masters und Tailorings) liegen in `private/` bzw. `applications/` und sind gitignored. Was im Repo-Root liegt, ist die öffentliche, anonymisierte Variante. (Wird bei `/onboard` geprüft und hier festgeschrieben.)
- Die echten `data_*.js`-Dateien sind die einzige Wahrheitsquelle für CV-Text. Nie Bullet-Text aus Markdown-Dokumenten oder aus dem Gedächtnis rekonstruieren.
- `docs/archive/CV_MASTER_STAND_*.md` ist historisch. Bei Widerspruch gewinnt der Code.
- Ändert sich ein Fakt (Zahl, Datum, Titel, Formulierung): in ALLEN betroffenen Dateien nachziehen (data_us, data_de, offene Tailorings) und am Ende auflisten, was Ben manuell ändern muss (LinkedIn, ggf. andere Plattformen).

## Struktur

| Datei | Zweck |
|---|---|
| `private/snapshot-20261102/` | Stand aus dem claude.ai-Projekt vom 02.11.2026, Referenz für den Abgleich |
| `src/renderer.js` | Gemeinsames Layout mit Locale-Konfiguration für EN und DE. Optional `employers`: Firmenkopf über aufeinanderfolgenden Rollen mit gleichem `company` |
| `src/data.js` | Datensuche (`applications/<name>/data.js`, `private/<name>.js`, `<name>.js`) für Build und Lint |
| `private/data_us.js` | Englischer Master = zweitseitiger Content-Pool, `[OPT]` markiert Streichkandidaten |
| `private/data_de.js` | Deutscher Master |
| `data_public.js` | Fiktive Beispieldaten, keine echten CV-Daten |
| `src/build.js` | CLI: `npm run cv -- <data-name> <Firma> [de]` |
| `src/lint.js` | CLI: `npm run lint:cv`, Regeln aus diesem Dokument; private Begriffe in `private/lint.config.js` |
| `jobs/` | Job-Scanner: Feeds scannen, Match-Score, Tailoring, Mail (siehe `jobs/README.md`) |
| `applications/<firma>/` | Pro Bewerbung: Stellenanzeige, Tailoring-Datei, Notizen (gitignored) |

## Befehle

```bash
npm install
npm run cv -- data_us Example             # EN Master-Content-Pool, validiert 2 Seiten
npm run cv -- data_de Example de          # DE, validiert 2 Seiten
npm run build:all                         # beide Master und alle Tailorings
npm run lint:cv                           # Inhaltschecks
pdftotext -layout output/<datei>.pdf -    # Überlauf diagnostizieren
pdftoppm -png -r 110 output/<datei>.pdf preview  # visuelle Kontrolle
```

## Harte Regeln für CV-Inhalte

1. **Nichts erfinden.** Jede Aussage muss im Interview verteidigbar sein. Auch auf Wunsch keine Zahlen oder Outcomes ergänzen, die nicht belegt sind. Fehlt etwas: als offene Frage notieren.
2. **Ehrliche Attribution.** Nur beanspruchen, was Ben selbst verantwortet hat (Details in `CLAUDE.local.md`).
3. **Eigenentwicklungen beschreiben, nicht benennen.** Interne Trusted-Shops-Namen (Teams, Services, Projektcodes) funktional umschreiben, sodass ein externer Leser sofort versteht, was es ist. Bekannte Produkte immer beim Namen nennen: Salesforce, HubSpot, Zuora, AWS, Stripe, GoCardless, PayPal.
4. **Zendesk** nie in CV oder Skills aufnehmen.
5. **Outcome zuerst, nicht Aktivität.** Struktur: Situation, Entscheidung, Trade-off, Ergebnis. Jeder Bullet der obersten Rolle braucht eine Zahl oder ein benanntes Outcome.
6. **Stil:** keine Gedankenstriche (— oder –) im Fließtext, kein Punkt am Bullet-Ende, „PM" statt „PO", Header-Titel „Senior Product Manager". Datumsbereiche dürfen den Halbgeviertstrich behalten („03/2026 – heute").
7. **Seitenzahl:** EN = 1 Seite, DE = 2 Seiten. Oberste Rolle max. 3-4 Bullets.
8. **Location:** Regel steht in `CLAUDE.local.md`.
9. **Dateiname:** `YYYYMMDD_Benjamin_Backwinkel_CV_<Firma>.pdf`, im Dokument steht „Ben Backwinkel". Nur PDF ausliefern, DOCX nur auf ausdrücklichen Wunsch.

## Drei-Perspektiven-Review (Pflicht für jeden Bullet, jede Summary, jede Nachricht)

Jede Aussage gleichzeitig prüfen aus Sicht von:

- **Product Manager (Peer):** Ist das echte Produktarbeit oder Projektmanagement? Ist die Entscheidung und der Trade-off erkennbar? Klingt es nach jemandem, der weiß, wovon er redet?
- **Vorgesetzter eines PM (Hiring Manager):** Welchen Scope und welche Verantwortung zeigt das? Würde ich diese Person mit einem größeren Problem betrauen? Ist der Impact geschäftsrelevant (Umsatz, Kosten, Risiko, Geschwindigkeit)?
- **HR / Recruiter (primäre Zielgruppe):** Verstehe ich das in 6 Sekunden ohne Trusted-Shops-Kontext? Finde ich die Keywords aus der Stellenanzeige? Wirkt die Zahl groß genug, oder klingt das nach internem Kleinkram?

Zusätzlich immer fragen: **Denken wir zu klein oder zu Trusted-Shops-intern?** Wenn ein Bullet nur für jemanden Sinn ergibt, der das interne Wiki kennt, umschreiben.

Ausgabeformat eines Reviews: pro Aussage eine kurze Zeile je Perspektive, dann ein Urteil (behalten / umschreiben / streichen) und bei „umschreiben" ein konkreter Gegenvorschlag.

## Deutsche Terminologie (nicht rückgängig machen)

| statt | verwenden |
|---|---|
| Datenzugriffsschicht | API-Schicht |
| „v2" | zweite API-Generation |
| stabile Verträge | stabile Schnittstellenverträge |
| bei gesichertem Delivery | ohne die laufende Auslieferung zu gefährden |
| Flow / Buchungslösung | Buchungsstrecke / Weg vom Angebot zur Buchung |
| automatisiertes Dunning | automatisiertes Mahnwesen |

Behalten: Cutover, Order-to-Cash, Breaking Changes, Quote-to-Order.
„Order Form" und „Booking Solution" sind dasselbe Konzept, nie als zwei Dinge darstellen.

## Deutsche CV-Konvention

Name links, Sektion „Persönliche Daten" ohne Geburtsdatum, „Kurzprofil" (2-3 sachliche Sätze), Datumsformat MM/JJJJ, alle Rollen einzeln, kein Foto, kein Poker, Location nach Regel 8.

## Englische CV-Konvention

Education ohne Jahreszahlen (US-Konvention), Sprachen in den Skills statt in der Summary, kein Poker, CSP-PO nur in den Skills. Mehrere Rollen beim selben Arbeitgeber unter einem Firmenkopf mit Aufstiegszeile (`employers` in den Daten).

## Tailoring-Workflow

1. Stellenanzeige nach `applications/<firma>/job.md` (Vorlage: `docs/templates/firma.md`).
2. Match-Analyse: Prozent, Stärken, Lücken, Empfehlung. Vorher Stelle live auf der Karriereseite / Greenhouse / Ashby / Personio verifizieren, nie Aggregator-Snippets trauen.
3. `applications/<firma>/data.js` per Spread auf den Master (`require("../../private/data_us")`), nur geänderte Felder überschreiben.
4. Build, Seitenzahl prüfen, dann Review durch den Subagent `cv-reviewer` (`.claude/agents/`, frischer Kontext, prüft Fakten gegen den Master plus Drei-Perspektiven-Review). Erst nach Freigabe PDF ausliefern.

## Kommunikation (Anschreiben, Recruiter-Nachrichten)

- Muss menschlich klingen, nicht nach KI. Keine Gedankenstriche, keine Floskeln, kurz.
- Recruiter hat das LinkedIn-Profil vermutlich schon gesehen, nichts doppelt erzählen.
- Gehaltsvorgaben stehen in `CLAUDE.local.md`.
- Schreibt Ben auf Englisch, auf Englisch antworten. Sonst Deutsch.

## Arbeitsweise

- Offensichtliche Qualitätsverbesserungen ohne Rückfrage umsetzen.
- Offene Fragen in `CLAUDE.local.md` unter „Offene Fragen" pflegen und bei passender Gelegenheit erneut stellen, bis sie beantwortet oder verworfen sind.
- Commits klein und sprechend, auf Deutsch oder Englisch, z. B. `data_us: Summary angeglichen`.

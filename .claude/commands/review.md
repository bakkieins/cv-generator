---
description: Drei-Perspektiven-Review für eine data-Datei oder einen Text
argument-hint: <datei oder Text>
---
Ist $ARGUMENTS ein gebauter CV (PDF, `data.js` oder Bewerbungsordner): Subagent `cv-reviewer` beauftragen und sein Ergebnis unverändert zeigen. Sonst (Summary-Entwurf, Nachricht, Anschreiben) selbst prüfen wie folgt.

Prüfe $ARGUMENTS nach dem Drei-Perspektiven-Review aus CLAUDE.md.

Für JEDEN Bullet, die Summary und den Titel:
1. Product Manager (Peer): eine Zeile
2. Vorgesetzter / Hiring Manager: eine Zeile
3. HR / Recruiter: eine Zeile
4. Zu klein oder zu Trusted-Shops-intern? ja/nein, warum
5. Urteil: behalten / umschreiben / streichen, bei „umschreiben" ein konkreter Gegenvorschlag

Danach: Regel-Check (Gedankenstriche, Punkt am Bullet-Ende, PM statt PO, keine internen Namen, kein Zendesk, Attribution).
Fakten nur aus CLAUDE.local.md verwenden. Fehlt ein Beleg, als offene Frage notieren statt zu erfinden.
Nichts ändern, bis Ben die Vorschläge freigibt.

---
description: CV bauen, zu PDF konvertieren und prüfen
argument-hint: <datafile> <Firma> [de]
---
Baue $ARGUMENTS:

1. `npm run cv -- $ARGUMENTS` ausführen. Das Script erstellt DOCX und PDF, validiert die Seitenzahl und benennt die Dateien im Ordner `output/`.
2. Bei einem Seitenzahlfehler den Umbruch mit `pdftotext -layout output/<datei>.pdf -` untersuchen und einen Kürzungsvorschlag machen.
3. Eine PNG-Vorschau nur bei Bedarf mit `pdftoppm -png -r 110 output/<datei>.pdf preview` erzeugen.
4. Nur das PDF ausliefern; DOCX nur auf ausdrücklichen Wunsch.

#!/bin/zsh
# Richtet den Job-Scanner als LaunchAgent ein (feste Uhrzeiten, siehe calendar_entries),
# dazu einen zweiten, der alle 2 Minuten Antworten mit angeforderten CVs abarbeitet.
# Aufruf: jobs/install-launchd.sh            installieren bzw. aktualisieren
#         jobs/install-launchd.sh uninstall  entfernen
set -euo pipefail

LABEL="com.benbackwinkel.cv-jobscan"
REPLIES_LABEL="$LABEL-replies"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
AGENTS="$HOME/Library/LaunchAgents"
LOG="$ROOT/private/jobs-state/scan.log"
DOMAIN="gui/$(id -u)"

for label in "$LABEL" "$REPLIES_LABEL"; do
  launchctl bootout "$DOMAIN/$label" 2>/dev/null || true
done

if [[ "${1:-}" == "uninstall" ]]; then
  rm -f "$AGENTS/$LABEL.plist" "$AGENTS/$REPLIES_LABEL.plist"
  echo "Job-Scanner entfernt."
  exit 0
fi

mkdir -p "$ROOT/private/jobs-state" "$HOME/Library/LaunchAgents"

# Feste Uhrzeiten (Ortszeit) nach der Auswertung vom 03.11.2026: Stellen erscheinen werktags in zwei Wellen,
# gegen 11 Uhr (Europa) und 14 bis 21 Uhr (USA), am Wochenende praktisch nie.
# 07:30 Mo–Sa fängt die US-Welle vom Vortag, 13:30 die europäische, 21:30 die US-Welle.
# Sonntag 21:30 dazu (08.11.2026), damit das Wochenende nicht ganz still bleibt.
# Verpasste Termine im Ruhezustand holt launchd beim Aufwachen nach.
calendar_entries() {
  local day time
  for day in 0 1 2 3 4 5 6; do
    for time in 7:30 13:30 21:30; do
      [[ $day == 6 && $time != 7:30 ]] && continue
      [[ $day == 0 && $time != 21:30 ]] && continue
      echo "    <dict><key>Weekday</key><integer>$day</integer><key>Hour</key><integer>${time%:*}</integer><key>Minute</key><integer>${time#*:}</integer></dict>"
    done
  done
}

# launchd kennt die Shell-PATH nicht. Alle Werkzeuge, die Scan, Build und Mail brauchen, explizit aufnehmen.
TOOL_PATH=""
for tool in node claude soffice pdfinfo pdftotext; do
  bin="$(command -v "$tool")" || { echo "✗ $tool nicht gefunden" >&2; exit 1; }
  dir="$(dirname "$bin")"
  [[ ":$TOOL_PATH:" == *":$dir:"* ]] || TOOL_PATH="${TOOL_PATH:+$TOOL_PATH:}$dir"
done
# write_agent <label> <Zeitplan als plist-XML> [Argument für scan.js]
write_agent() {
  local plist="$AGENTS/$1.plist"
  cat > "$plist" <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>$1</string>
  <key>ProgramArguments</key>
  <array>
    <string>$(command -v node)</string>
    <string>$ROOT/jobs/scan.js</string>${3:+
    <string>$3</string>}
  </array>
  <key>WorkingDirectory</key><string>$ROOT</string>
  <key>EnvironmentVariables</key>
  <dict>
    <key>PATH</key><string>$TOOL_PATH:/usr/bin:/bin:/usr/sbin:/sbin</string>
  </dict>
$2
  <key>StandardOutPath</key><string>$LOG</string>
  <key>StandardErrorPath</key><string>$LOG</string>
</dict>
</plist>
EOF
  launchctl bootstrap "$DOMAIN" "$plist"
}

write_agent "$LABEL" "  <key>StartCalendarInterval</key>
  <array>
$(calendar_entries)
  </array>
  <key>RunAtLoad</key><true/>"
# Antworten alle 2 Minuten: eine IMAP-Suche, ohne Antwort kein Claude-Aufruf. Läuft gerade ein Scan, arbeitet der die Antworten gleich mit ab.
write_agent "$REPLIES_LABEL" "  <key>StartInterval</key><integer>120</integer>" --replies
echo "Job-Scanner aktiv: Mo–Sa 07:30, Mo–Fr zusätzlich 13:30 und 21:30, So 21:30, Antworten alle 2 Minuten. Log: $LOG"

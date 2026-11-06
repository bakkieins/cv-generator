#!/bin/zsh
# Richtet den Job-Scanner als LaunchAgent ein (feste Uhrzeiten, siehe calendar_entries).
# Aufruf: jobs/install-launchd.sh            installieren bzw. aktualisieren
#         jobs/install-launchd.sh uninstall  entfernen
set -euo pipefail

LABEL="com.benbackwinkel.cv-jobscan"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
PLIST="$HOME/Library/LaunchAgents/$LABEL.plist"
LOG="$ROOT/private/jobs-state/scan.log"
DOMAIN="gui/$(id -u)"

launchctl bootout "$DOMAIN/$LABEL" 2>/dev/null || true

if [[ "${1:-}" == "uninstall" ]]; then
  rm -f "$PLIST"
  echo "Job-Scanner entfernt."
  exit 0
fi

mkdir -p "$ROOT/private/jobs-state" "$HOME/Library/LaunchAgents"

# Feste Uhrzeiten (Ortszeit) nach der Auswertung vom 03.11.2026: Stellen erscheinen werktags in zwei Wellen,
# gegen 11 Uhr (Europa) und 14 bis 21 Uhr (USA), am Wochenende praktisch nie.
# 07:30 Mo–Sa fängt die US-Welle vom Vortag, 13:30 die europäische, 21:30 die US-Welle. Sonntag frei.
# Verpasste Termine im Ruhezustand holt launchd beim Aufwachen nach.
calendar_entries() {
  local day time
  for day in 1 2 3 4 5 6; do
    for time in 7:30 13:30 21:30; do
      [[ $day == 6 && $time != 7:30 ]] && continue
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
cat > "$PLIST" <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>$LABEL</string>
  <key>ProgramArguments</key>
  <array>
    <string>$(command -v node)</string>
    <string>$ROOT/jobs/scan.js</string>
  </array>
  <key>WorkingDirectory</key><string>$ROOT</string>
  <key>EnvironmentVariables</key>
  <dict>
    <key>PATH</key><string>$TOOL_PATH:/usr/bin:/bin:/usr/sbin:/sbin</string>
  </dict>
  <key>StartCalendarInterval</key>
  <array>
$(calendar_entries)
  </array>
  <key>RunAtLoad</key><true/>
  <key>StandardOutPath</key><string>$LOG</string>
  <key>StandardErrorPath</key><string>$LOG</string>
</dict>
</plist>
EOF

launchctl bootstrap "$DOMAIN" "$PLIST"
echo "Job-Scanner aktiv: Mo–Sa 07:30, Mo–Fr zusätzlich 13:30 und 21:30. Log: $LOG"

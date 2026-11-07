#!/bin/zsh
# Sichert alles, was nicht ins öffentliche Repo gehört, als verschlüsseltes Disk-Image (AES-256) in iCloud Drive.
# Wiederherstellen: DMG doppelklicken, Passwort eingeben, Inhalt zurück ins Repo kopieren.
# Aufruf: npm run backup
# Passwort einmalig im Schlüsselbund ablegen (und zusätzlich im Passwortmanager, sonst ist es mit dem Mac weg):
#   security add-generic-password -s cv-backup -a "$USER" -w
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
DEST="${BACKUP_DEST:-$HOME/Library/Mobile Documents/com~apple~CloudDocs/cv-generator-backup}"
KEEP=10
# Lokale Claude-Code-Erinnerungen zu diesem Projekt liegen außerhalb des Repos.
MEMORY="$HOME/.claude/projects/$(echo "$ROOT" | tr '/' '-')/memory"

password="${BACKUP_PASSWORD:-$(security find-generic-password -s cv-backup -a "$USER" -w 2>/dev/null || true)}"
if [[ -z "$password" ]]; then
  echo "✗ Kein Backup-Passwort im Schlüsselbund. Einmalig anlegen mit:" >&2
  echo "  security add-generic-password -s cv-backup -a \"\$USER\" -w" >&2
  exit 1
fi

staging="$(mktemp -d)"
trap 'rm -rf "$staging"' EXIT
mkdir -p "$staging/cv-private" "$DEST"
for item in private applications output CLAUDE.local.md; do
  [[ -e "$ROOT/$item" ]] && cp -R "$ROOT/$item" "$staging/cv-private/"
done
[[ -d "$MEMORY" ]] && cp -R "$MEMORY" "$staging/cv-private/claude-memory"

name="cv-private-$(date +%Y%m%d-%H%M).dmg"
printf '%s\0' "$password" | hdiutil create -quiet -srcfolder "$staging/cv-private" -volname cv-private \
  -encryption AES-256 -stdinpass -format UDZO "$DEST/$name"

# Nur die letzten $KEEP Sicherungen behalten.
ls -1t "$DEST"/cv-private-*.dmg | tail -n +$((KEEP + 1)) | while read -r old; do rm -f "$old"; done
echo "✓ Backup: $DEST/$name ($(du -h "$DEST/$name" | cut -f1))"

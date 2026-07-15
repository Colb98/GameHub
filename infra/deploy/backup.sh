#!/usr/bin/env bash
# Nightly Postgres dump + optional offsite sync with rclone.
# Run this from the deployment user's crontab.
# Cron example: 0 3 * * * $HOME/gamehub/backup.sh >> $HOME/gamehub/backup.log 2>&1
set -euo pipefail

GAMEHUB_DIR="${GAMEHUB_DIR:-$HOME/gamehub}"
BACKUP_DIR="$GAMEHUB_DIR/backups"
KEEP_DAYS=14
STAMP=$(date +%Y%m%d-%H%M%S)

mkdir -p "$BACKUP_DIR"
docker compose --env-file "$GAMEHUB_DIR/.env" -f "$GAMEHUB_DIR/docker-compose.prod.yml" exec -T postgres \
  pg_dump -U gamehub gamehub | gzip > "$BACKUP_DIR/gamehub-$STAMP.sql.gz"

find "$BACKUP_DIR" -name 'gamehub-*.sql.gz' -mtime +$KEEP_DAYS -delete

# Offsite copy (configure a remote first: rclone config — e.g. Backblaze B2)
if command -v rclone >/dev/null 2>&1; then
  rclone copy "$BACKUP_DIR" remote:gamehub-backups --max-age 48h || true
fi

echo "backup done: gamehub-$STAMP.sql.gz"

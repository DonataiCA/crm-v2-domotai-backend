#!/bin/bash
# ============================================================================
# DomotaiCRM — Database backup script
# Run on the EC2 server. Recommended: add to crontab for daily backups.
# crontab -e → 0 3 * * * /opt/domotai/backup-db.sh
# ============================================================================
set -euo pipefail

BACKUP_DIR="/opt/domotai/backups"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
BACKUP_FILE="$BACKUP_DIR/domotaicrm_$TIMESTAMP.sql.gz"
RETENTION_DAYS=14

mkdir -p "$BACKUP_DIR"

echo "[$(date)] Starting backup..."

docker exec domotai-postgres pg_dump \
    -U domotai \
    -d domotaicrm \
    --no-owner \
    --no-privileges \
    | gzip > "$BACKUP_FILE"

SIZE=$(du -sh "$BACKUP_FILE" | cut -f1)
echo "[$(date)] Backup complete: $BACKUP_FILE ($SIZE)"

# Clean old backups
find "$BACKUP_DIR" -name "*.sql.gz" -mtime +$RETENTION_DAYS -delete
echo "[$(date)] Cleaned backups older than $RETENTION_DAYS days"

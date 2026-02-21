#!/usr/bin/env bash
set -euo pipefail

# =============================================================================
# Mema — Database Backup to Backblaze B2 (S3-compatible)
# =============================================================================
# Dumps PostgreSQL via docker compose, uploads to B2, cleans up old backups.
# Intended to run as a daily cron job.

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
[[ -f "$SCRIPT_DIR/../.env" ]] && source "$SCRIPT_DIR/../.env"

# --- Logging ---
log() { echo "[$(date -u +"%Y-%m-%dT%H:%M:%SZ")] $*"; }

# --- Check required commands ---
for CMD in aws docker; do
  if ! command -v "$CMD" &>/dev/null; then
    log "ERROR: Required command '$CMD' is not installed."
    exit 1
  fi
done

if ! docker compose version &>/dev/null; then
  log "ERROR: 'docker compose' plugin is not available."
  exit 1
fi

# --- Validate required environment variables ---
REQUIRED_VARS=(
  B2_APPLICATION_KEY_ID
  B2_APPLICATION_KEY
  B2_BUCKET_NAME
  POSTGRES_DB
  POSTGRES_USER
  POSTGRES_PASSWORD
)

for VAR in "${REQUIRED_VARS[@]}"; do
  if [[ -z "${!VAR:-}" ]]; then
    log "ERROR: Required environment variable $VAR is not set."
    exit 1
  fi
done

# --- Generate backup filename ---
TIMESTAMP=$(date -u +"%Y-%m-%dT%H%M%SZ")
BACKUP_FILE="mema-backup-${TIMESTAMP}.dump"

# --- Cleanup trap ---
cleanup() { rm -f "/tmp/$BACKUP_FILE"; }
trap cleanup EXIT

# --- Dump database ---
log "Starting database backup: $BACKUP_FILE"
docker compose exec -T -e PGPASSWORD="$POSTGRES_PASSWORD" db \
  pg_dump --username="$POSTGRES_USER" --dbname="$POSTGRES_DB" --format=custom \
  > "/tmp/$BACKUP_FILE"

log "Database dump complete. Size: $(du -h "/tmp/$BACKUP_FILE" | cut -f1)"

# --- Configure AWS credentials for B2 ---
export AWS_ACCESS_KEY_ID="$B2_APPLICATION_KEY_ID"
export AWS_SECRET_ACCESS_KEY="$B2_APPLICATION_KEY"
B2_ENDPOINT_URL="${B2_ENDPOINT_URL:-https://s3.us-west-004.backblazeb2.com}"

# --- Upload to B2 ---
log "Uploading to s3://$B2_BUCKET_NAME/$BACKUP_FILE"
aws s3 cp "/tmp/$BACKUP_FILE" "s3://$B2_BUCKET_NAME/$BACKUP_FILE" \
  --endpoint-url "$B2_ENDPOINT_URL"

log "Upload complete."

# --- 7-day retention cleanup ---
log "Cleaning up backups older than 7 days..."
# GNU date (-d) on Linux, BSD date (-v) on macOS
CUTOFF_DATE=$(date -u -d "7 days ago" +"%Y-%m-%d" 2>/dev/null || date -u -v-7d +"%Y-%m-%d")

if [[ -z "$CUTOFF_DATE" || ! "$CUTOFF_DATE" =~ ^[0-9]{4}-[0-9]{2}-[0-9]{2}$ ]]; then
  log "WARNING: Could not compute cutoff date. Skipping retention cleanup."
else
  while read -r line; do
    FILENAME=$(echo "$line" | awk '{print $4}')
    if [[ "$FILENAME" == mema-backup-*.dump ]]; then
      # Extract YYYY-MM-DD from mema-backup-YYYY-MM-DDTHHMMSSZ.dump
      FILE_DATE="${FILENAME#mema-backup-}"
      FILE_DATE="${FILE_DATE%%T*}"
      if [[ "$FILE_DATE" =~ ^[0-9]{4}-[0-9]{2}-[0-9]{2}$ && "$FILE_DATE" < "$CUTOFF_DATE" ]]; then
        log "Deleting old backup: $FILENAME"
        aws s3 rm "s3://$B2_BUCKET_NAME/$FILENAME" --endpoint-url "$B2_ENDPOINT_URL"
      fi
    fi
  done < <(aws s3 ls "s3://$B2_BUCKET_NAME/" --endpoint-url "$B2_ENDPOINT_URL")
fi

log "Backup process complete."

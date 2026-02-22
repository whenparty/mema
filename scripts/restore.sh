#!/usr/bin/env bash
set -euo pipefail

# =============================================================================
# Mema — Database Restore from Backblaze B2 (S3-compatible)
# =============================================================================
# Downloads a backup dump from B2 and restores it into PostgreSQL via
# docker compose. Run without arguments to list available backups.

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
[[ -f "$SCRIPT_DIR/../.env" ]] && source "$SCRIPT_DIR/../.env"

# --- Logging ---
log() { echo "[$(date -u +"%Y-%m-%dT%H:%M:%SZ")] $*"; }

# --- Check required commands ---
if ! command -v docker &>/dev/null; then
  log "ERROR: Required command 'docker' is not installed."
  exit 1
fi

if ! docker compose version &>/dev/null; then
  log "ERROR: 'docker compose' plugin is not available."
  exit 1
fi

# --- AWS CLI via Docker (no host install needed) ---
aws_cli() {
  docker run --rm \
    -e AWS_ACCESS_KEY_ID="$B2_APPLICATION_KEY_ID" \
    -e AWS_SECRET_ACCESS_KEY="$B2_APPLICATION_KEY" \
    -v /tmp:/tmp \
    amazon/aws-cli "$@"
}

# --- Usage / list backups when no argument provided ---
if [[ -z "${1:-}" ]]; then
  echo "Usage: ./scripts/restore.sh <backup-filename>"
  echo "Example: ./scripts/restore.sh mema-backup-2026-02-22T120000Z.dump"
  echo ""

  if [[ -n "${B2_APPLICATION_KEY_ID:-}" ]]; then
    B2_ENDPOINT_URL="${B2_ENDPOINT_URL:-https://s3.us-west-004.backblazeb2.com}"
    echo "Available backups:"
    aws_cli s3 ls "s3://$B2_BUCKET_NAME/" --endpoint-url "$B2_ENDPOINT_URL"
  fi

  exit 1
fi

BACKUP_FILE="$1"

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

B2_ENDPOINT_URL="${B2_ENDPOINT_URL:-https://s3.us-west-004.backblazeb2.com}"

# --- Cleanup trap ---
cleanup() { rm -f "/tmp/$BACKUP_FILE"; }
trap cleanup EXIT

# --- Download backup from B2 ---
log "Downloading s3://$B2_BUCKET_NAME/$BACKUP_FILE"
aws_cli s3 cp "s3://$B2_BUCKET_NAME/$BACKUP_FILE" "/tmp/$BACKUP_FILE" \
  --endpoint-url "$B2_ENDPOINT_URL"

log "Download complete. Size: $(du -h "/tmp/$BACKUP_FILE" | cut -f1)"

# --- Restore database ---
log "Restoring database from $BACKUP_FILE"
docker compose exec -T -e PGPASSWORD="$POSTGRES_PASSWORD" db \
  pg_restore --username="$POSTGRES_USER" --dbname="$POSTGRES_DB" \
  --clean --if-exists --verbose < "/tmp/$BACKUP_FILE"

log "Restore complete."

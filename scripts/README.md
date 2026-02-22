# Scripts

## Database Backup

The `backup.sh` script creates a PostgreSQL dump of the Mema database and uploads
it to Backblaze B2 (S3-compatible storage). It also performs 7-day retention
cleanup, deleting backups older than 7 days from the bucket.

The `restore.sh` script downloads a backup from B2 and restores it into the
running PostgreSQL container. Run it without arguments to list available backups.

## Prerequisites

- **Docker** -- the scripts run `amazon/aws-cli` via `docker run` (no host AWS CLI install needed)
- **Backblaze B2 bucket** -- created with an application key that has read/write access
- **Docker Compose** -- the `db` service must be running (`docker compose up -d db`)

## Environment Variables

All variables are documented in `.env.example`. The scripts source `.env` from the
project root automatically if it exists.

| Variable | Description |
|----------|-------------|
| `B2_APPLICATION_KEY_ID` | Backblaze B2 application key ID (maps to AWS access key) |
| `B2_APPLICATION_KEY` | Backblaze B2 application key secret (maps to AWS secret key) |
| `B2_BUCKET_NAME` | Name of the B2 bucket for storing backups |
| `B2_ENDPOINT_URL` | S3-compatible endpoint URL (default: `https://s3.us-west-004.backblazeb2.com`) |
| `POSTGRES_DB` | PostgreSQL database name |
| `POSTGRES_USER` | PostgreSQL username |
| `POSTGRES_PASSWORD` | PostgreSQL password |

## Cron Setup

Schedule daily backups at 03:00 UTC:

```
0 3 * * * cd /path/to/mema && mkdir -p logs && ./scripts/backup.sh >> logs/backup.log 2>&1
```

Scripts must run from the project root because they source `.env` and use
`docker compose` to connect to the database container.

## Log Rotation

Configure logrotate for the backup log (run as root once):

```bash
cat > /etc/logrotate.d/mema-backup << 'EOF'
/path/to/mema/logs/backup.log {
    weekly
    rotate 4
    compress
    missingok
    notifempty
}
EOF
```

Replace `/path/to/mema` with the actual deploy path.

## Manual Restore

1. **List available backups** (no arguments):
   ```bash
   ./scripts/restore.sh
   ```

2. **Restore a specific backup**:
   ```bash
   ./scripts/restore.sh mema-backup-2026-02-22T120000Z.dump
   ```

3. **Verify data integrity** after restore:
   ```bash
   # Check the health endpoint
   curl -f http://localhost:3000/health

   # Verify key tables have data
   docker compose exec -T db psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" \
     -c "SELECT count(*) FROM users; SELECT count(*) FROM facts;"
   ```
   Compare row counts against known values before the restore.

## Retention

- **Script-side cleanup**: `backup.sh` deletes backups older than 7 days from
  the B2 bucket after each successful upload.
- **B2 lifecycle rules** (recommended): Configure a lifecycle rule on the bucket
  as defense-in-depth to auto-delete objects older than 14 days, in case the
  script-side cleanup fails.

## Monitoring

- Check the log file (`logs/backup.log`) for errors.
- Consider alerting on non-zero exit codes from the cron job (e.g., via a
  monitoring tool or a simple wrapper script that sends notifications on failure).
- All scripts connect to PostgreSQL via `docker compose exec` -- no host-level
  `pg_dump` or `pg_restore` installation is needed.
- AWS CLI runs inside `amazon/aws-cli` Docker container -- no host-level `aws`
  installation is needed.

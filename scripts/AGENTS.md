# Scripts

## Purpose

Utility shell scripts for database operations, deployment, and maintenance.
Flat structure until a second domain appears, then split into subdirectories
(e.g., `db/`, `deploy/`).

## Key Files

- `backup.sh` — Daily pg_dump via `docker compose exec`, upload to Backblaze B2, 7-day retention cleanup
- `restore.sh` — Download backup from B2, pg_restore via `docker compose exec --clean --if-exists --verbose`
- `README.md` — Prerequisites (AWS CLI, Docker), cron setup, restore procedure, monitoring

## Patterns & Decisions

- Scripts use `docker compose exec -T db` to run pg_dump/pg_restore inside the container (avoids host pg_dump version mismatch)
- B2 access via AWS CLI with S3-compatible endpoint (`--endpoint-url`)
- Each script: sources `.env` from project root, validates env vars, checks for `aws`/`docker compose` commands
- Backup filenames: `mema-backup-YYYY-MM-DDTHHMMSSZ.dump` (timestamp-based, idempotent)
- Retention: script-side 7-day cleanup + B2 lifecycle rules as defense-in-depth
- Cross-platform date: GNU `-d` with BSD `-v` fallback
- Logging: `[ISO-8601-UTC] message` format for cron log capture

## Dependencies

- imports from: none (standalone shell scripts)
- imported by: none (invoked via cron or manually)
- requires: AWS CLI v2, Docker Compose, running `db` service

## Testing

- Tests in `tests/scripts/` (structural/content-based, not execution)
- `tests/scripts/backup.test.ts` — 15 tests (script structure + .env.example B2 vars)
- `tests/scripts/restore.test.ts` — 10 tests (script structure)

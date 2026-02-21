# Mema

Personal AI assistant Telegram bot where memory is the core product.
Remembers meaningful facts from natural conversation, uses them contextually,
and gives users full control over what has been remembered.

## Development

```bash
cp .env.example .env    # fill in actual values
bun install
bun run dev
```

### Scripts

| Command | Description |
|---------|-------------|
| `bun run dev` | Start development server |
| `bun run test` | Run tests (vitest) |
| `bun run typecheck` | TypeScript type check |
| `bun run lint` | Biome linter |
| `bun run db:generate` | Generate Drizzle migrations |
| `bun run db:migrate` | Run Drizzle migrations |

### Local database

```bash
docker compose up db -d    # start PostgreSQL with pgvector
```

Requires `POSTGRES_PASSWORD` in `.env`.

## CI/CD

Push to `main` triggers the GitHub Actions pipeline (`.github/workflows/ci.yml`):

1. **CI job** — typecheck, lint, test (with PostgreSQL service container)
2. **Deploy job** (main only) — build Docker image, push to GHCR, SSH deploy to VPS

### Required GitHub Secrets

Configure in **Settings > Secrets and variables > Actions**:

| Secret | Description |
|--------|-------------|
| `VPS_HOST` | BinaryLane VPS IP address or hostname |
| `VPS_USER` | SSH username (e.g., `deploy`) |
| `VPS_SSH_KEY` | Private SSH key for VPS access (Ed25519 or RSA) |
| `VPS_DEPLOY_PATH` | Absolute path to project on VPS (e.g., `/opt/mema`) |

`GITHUB_TOKEN` is provided automatically by GitHub Actions.

### VPS setup (one-time)

1. SSH access configured for the deploy user
2. Docker and Docker Compose installed
3. Authenticate to GHCR: `echo "$PAT" | docker login ghcr.io -u USERNAME --password-stdin`
4. Clone the repo and place `.env` at `VPS_DEPLOY_PATH`

---
name: config-summary
description: >
  Read project config files and return a structured summary for downstream subagents.
---

# Project Config Summary

## Purpose
Summarize project configuration so downstream subagents (planner, implementer, reviewer)
don't need to read raw config files themselves.

## Files to Read
- `package.json` — dependencies and scripts
- `bun.lock` — extract exact versions of key dependencies only
- `tsconfig.json` — compiler options
- `docker-compose.yml` — services, images, ports
- `Dockerfile` — base image, build stages
- `drizzle.config.ts` — DB config, migration directory

## Output Format
Return a structured summary (max 50 lines) in this exact format:

```
## Project Config Summary
### Key Dependencies (name: version)
[top-level deps from package.json with exact versions from bun.lock]
### Scripts
[available npm scripts]
### TypeScript (target, module, key compiler flags)
### Docker (services, images, ports, volumes)
### Database (ORM config, migration dir)
```

## Rules
- Extract exact versions from bun.lock, not semver ranges from package.json
- Keep the summary under 50 lines
- No interpretation or recommendations — just facts
- If a file doesn't exist yet, note its absence; do not guess contents

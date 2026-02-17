# 001 — Bun Runtime Compatibility

**Status:** accepted
**Date:** 2026-02-17
**Spike:** TASK-0.1
**Affects:** entire stack — all EPIC-1 through EPIC-13 tasks

## Decision

Proceed with Bun as the runtime. All three critical dependencies (grammy, pg-boss, Drizzle ORM) work correctly under Bun 1.3.0 with minor workarounds.

## Context

The project architecture specifies Bun as the runtime for performance and built-in TypeScript support. Before starting implementation, we needed to confirm that the three most critical npm dependencies — grammy (Telegram), pg-boss (job queue), and Drizzle ORM (database) — function correctly under Bun, since they are primarily developed for Node.js.

## Findings

### Elysia (v1.4.25) ✅

- Starts and serves HTTP requests on Bun without issues
- Native Bun performance, no workarounds needed

### grammy (v1.40.0) ✅

- Library loads and constructs a Bot instance under Bun
- Webhook endpoint works when mounted on Elysia via `.post()` handler
- `bot.handleUpdate()` processes fake Telegram updates correctly
- Message handlers are registered and the webhook HTTP pipeline functions end-to-end
- **Note:** grammy officially documents Node.js and Deno support; Bun is not listed but works in practice. Community templates confirm Bun usage.
- **Workaround:** none needed

### Drizzle ORM (v0.45.1) + postgres (v3.4.8) + pgvector (v0.8.1) ✅

- Connects to PostgreSQL via `postgres` driver on Bun
- pgvector extension enables successfully
- Table creation with `vector(N)` column works
- Full CRUD operations (insert, select, update, delete) via Drizzle query builder
- Cosine similarity search (`<=>` operator) works via `sql` template literal
- Combined filtering (`user_id` + `status` + vector similarity) in a single query works correctly
- **Note:** Drizzle has official Bun support documentation (Bun SQL page)
- **Workaround:** none needed. Native `vector` type from `drizzle-orm/pg-core` works.

### pg-boss (v12.12.0) ✅

- Starts under Bun, creates its schema in PostgreSQL
- Job creation and immediate execution work
- Scheduled jobs (`startAfter: 3` seconds) fire correctly (~4s observed, within acceptable range)
- Retry on failure works: job fails on attempt 1, retries and succeeds on attempt 2
- **Workarounds:**
  1. Use named import: `import { PgBoss } from "pg-boss"` (not `import PgBoss from "pg-boss"`)
  2. v12 requires explicit `boss.createQueue(name)` before `boss.send()` — this is a pg-boss v12 API change, not a Bun issue
- **Note:** `job.data` access pattern may differ in v12 — needs verification during implementation

### Versions Tested

| Package | Version |
|---------|---------|
| Bun | 1.3.0 |
| Elysia | 1.4.25 |
| grammy | 1.40.0 |
| drizzle-orm | 0.45.1 |
| postgres | 3.4.8 |
| pg-boss | 12.12.0 |
| PostgreSQL | 17.8 |
| pgvector | 0.8.1 |

## Consequences

- **No migration to Node.js needed** — Bun is confirmed as the runtime
- All EPIC-1 through EPIC-13 tasks can proceed with Bun
- pg-boss import style must use named export (`{ PgBoss }`)
- pg-boss v12 queue creation API must be followed (explicit `createQueue()`)
- grammy webhook integration is straightforward via Elysia POST handler
- Drizzle pgvector integration requires no custom types — native `vector` column works

## Alternatives Considered

- **Node.js runtime:** Not needed — all dependencies work on Bun. Would lose built-in TypeScript support and Bun-native Elysia performance.
- **GramIO instead of grammy:** GramIO has explicit Bun support, but grammy works fine and has a larger ecosystem. No reason to switch.
- **pgqueue instead of pg-boss:** pgqueue targets Bun explicitly, but pg-boss works on Bun and has a more mature feature set (SKIP LOCKED, retry, scheduling). No reason to switch.

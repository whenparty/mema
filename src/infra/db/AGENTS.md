# Database Module

## Purpose

Database schema definitions, client factory, and migration runner for Mema.
Implements all 12 data entities from the specification (FR-MEM, FR-REM, FR-SYS)
using Drizzle ORM with PostgreSQL and pgvector for semantic vector search.

## Key Files

- `schema.ts` — Barrel re-export of all schema tables and types
- `schema/users.ts` — `users` and `user_auths` tables, `UserStatus`, `AuthProvider` types
- `schema/messages.ts` — `messages` table, `MessageRole`, `ProcessingStatus` types
- `schema/facts.ts` — `facts` table with `vector(1536)` embedding column, `FactType`, `TemporalSensitivity`, `FactStatus` types
- `schema/entities.ts` — `entities` and `fact_entities` (junction) tables, `EntityType` type
- `schema/reminders.ts` — `reminders` table, `ReminderType`, `ReminderStatus` types
- `schema/dialog-states.ts` — `dialog_states` table (1:1 with User), `DialogStateType` type
- `schema/evaluations.ts` — `evaluations` table, `EvalType`, `EvalVerdict` types
- `schema/interests.ts` — `interest_scans` (1:1 with User) and `interest_candidates` tables, `InterestCandidateStatus` type
- `schema/token-usages.ts` — `token_usages` table
- `client.ts` — `createDbClient(connectionUrl)` factory, `DbClient` type
- `migrate.ts` — `runMigrations(connectionUrl)` runs `CREATE EXTENSION vector` then Drizzle migrations
- `tests/` — unit tests for client, migrate, schema barrel, drizzle config
- `schema/tests/` — unit tests for individual schema files

## Interfaces

- All table objects: `users`, `userAuths`, `messages`, `facts`, `entities`, `factEntities`, `reminders`, `dialogStates`, `evaluations`, `interestScans`, `interestCandidates`, `tokenUsages`
- Type unions: `UserStatus`, `AuthProvider`, `MessageRole`, `ProcessingStatus`, `FactType`, `TemporalSensitivity`, `FactStatus`, `EntityType`, `ReminderType`, `ReminderStatus`, `DialogStateType`, `EvalType`, `EvalVerdict`, `InterestCandidateStatus`
- `createDbClient(connectionUrl: string)` — returns Drizzle instance with schema
- `DbClient` — return type of `createDbClient`
- `runMigrations(connectionUrl: string)` — enables pgvector extension and runs migrations

## Patterns & Decisions

- `text()` for enum-like fields with exported TypeScript type unions (not DB enums)
- `uuid("id").defaultRandom().primaryKey()` for all IDs
- `timestamp("...", { withTimezone: true })` for all timestamp columns (timestamptz)
- `vector("embedding", { dimensions: 1536 })` native Drizzle type (no pgvector package)
- Every table except `users` has `user_id` FK to `users.id` with `.notNull()`
- `dialog_states` and `interest_scans` use `user_id` as PK (1:1 with User)
- `fact_entities` has composite PK `(fact_id, entity_id)`
- Self-referencing FK in `facts.previous_version_id` uses `AnyPgColumn` return type
- Lazy FK references: `.references(() => otherTable.column)` for cross-file dependencies
- No HNSW index — brute-force cosine distance is fast enough at scale (spike 002)
- `$type<T>()` used to narrow text columns to TypeScript union types

## Dependencies

- imports from: drizzle-orm, drizzle-orm/pg-core, postgres
- imported by: (future pipeline, gateway, and infra modules)
- dev dependency: drizzle-kit (migration generation)

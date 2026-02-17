# 002 — Drizzle ORM + pgvector Integration

**Status:** accepted
**Date:** 2026-02-17
**Spike:** TASK-0.2
**Affects:** TASK-1.3 (DB schema), TASK-3.4 (embedding service), TASK-6.1 (semantic search), TASK-5.5 (fact persistence)

## Decision

Use Drizzle ORM's native `vector` column type and built-in `cosineDistance()` function for pgvector integration. No custom types or raw SQL wrappers needed. HNSW index is deferred — brute-force scan is sufficient for <10K facts per user.

## Context

The project requires storing 1536-dimension embeddings in PostgreSQL via pgvector and performing cosine similarity searches filtered by `user_id` and `status`. We needed to confirm that Drizzle ORM supports this natively or if custom column types and raw SQL would be required.

## Findings

### Native Vector Type ✅

Drizzle ORM (v0.45.1) has built-in `vector` support in `drizzle-orm/pg-core`:

```typescript
import { pgTable, uuid, text, vector, index } from "drizzle-orm/pg-core";

export const facts = pgTable("facts", {
  id: uuid("id").defaultRandom().primaryKey(),
  userId: uuid("user_id").notNull(),
  content: text("content").notNull(),
  embedding: vector("embedding", { dimensions: 1536 }),
  status: text("status").notNull().default("active"),
});
```

- No custom column types needed
- `drizzle-kit generate` produces correct SQL: `"embedding" vector(1536)`
- Embedding round-trip precision: max error 3.33e-9 (excellent)
- Null embeddings supported (for facts not yet embedded)
- Dimension mismatch is correctly rejected by PostgreSQL

### Cosine Similarity Queries ✅

Drizzle provides `cosineDistance()` from `drizzle-orm`:

```typescript
import { cosineDistance, desc, gt, and, eq, sql } from "drizzle-orm";

const similarity = sql<number>`1 - (${cosineDistance(facts.embedding, queryVector)})`;

const results = await db
  .select({ content: facts.content, similarity })
  .from(facts)
  .where(and(eq(facts.userId, userId), eq(facts.status, "active")))
  .orderBy(desc(similarity))
  .limit(10);
```

Other distance functions available: `l2Distance`, `innerProduct`, `l1Distance`, `hammingDistance`, `jaccardDistance`.

### Combined Filtering ✅

`user_id` + `status` + vector similarity + threshold in a single query:

```typescript
const results = await db
  .select({ content: facts.content, similarity })
  .from(facts)
  .where(
    and(
      eq(facts.userId, userId),
      eq(facts.status, "active"),
      gt(similarity, 0.5)  // threshold filter
    )
  )
  .orderBy(desc(similarity))
  .limit(10);
```

Tested and confirmed: correctly excludes other users' facts, outdated facts, and below-threshold results.

### HNSW Index ✅ (works, but not needed for MVP)

Drizzle supports HNSW index declaration in schema:

```typescript
index("facts_embedding_hnsw_idx").using(
  "hnsw",
  table.embedding.op("vector_cosine_ops")
)
```

`drizzle-kit generate` produces correct SQL: `USING hnsw ("embedding" vector_cosine_ops)`.

### Migration Generation ✅

`drizzle-kit generate` correctly handles vector columns and HNSW indexes — no manual SQL needed.

### Performance Benchmarks

| Records | Insert (batch 500) | HNSW Build | Search (HNSW) | Search (brute-force) |
|---------|-------------------|------------|---------------|---------------------|
| 1,000 | 0.31s (0.3ms/rec) | 0.72s | 4.2ms avg | 3.6ms avg |
| 10,000 | 2.52s (0.3ms/rec) | 16.4s | 32.8ms avg | 29.1ms avg |

**Key observations:**

- At 1K records, brute-force is actually faster than HNSW (~3.6ms vs ~4.2ms). HNSW overhead exceeds its benefit at this scale.
- At 10K records, performance is similar (~29ms brute-force vs ~33ms HNSW). HNSW doesn't help because the `user_id` WHERE filter already reduces the effective dataset, and HNSW pre-filter + row filter has overhead.
- At 10K records with 1536 dimensions, HNSW graph exceeds `maintenance_work_mem` (default 64MB). Fix: `SET maintenance_work_mem = '256MB'` during index build.
- These benchmarks are worst-case: all records belong to one user. In production, per-user fact counts will be much lower.

**Conclusion:** Aligns with spec (4.4): "With < 10K facts per user — brute-force scan is sufficient (<5ms)." HNSW index is unnecessary for MVP, can be added later if a user accumulates >10K facts.

### Versions Tested

| Package | Version |
|---------|---------|
| Bun | 1.3.0 |
| drizzle-orm | 0.45.1 |
| drizzle-kit | 0.31.9 |
| postgres | 3.4.8 |
| PostgreSQL | 17 |
| pgvector | 0.8.1 |

## Consequences

- **No custom types needed** — Drizzle's native `vector()` column works out of the box
- **No raw SQL for queries** — `cosineDistance()` from `drizzle-orm` works in the query builder
- **Schema definition is clean** — vector column and HNSW index declared alongside other columns
- **Migration generation works** — `drizzle-kit generate` handles vector columns correctly
- **HNSW index deferred** — define it in schema for documentation, but do not create in initial migration. Add when per-user facts exceed 10K. When building HNSW at scale, increase `maintenance_work_mem` to 256MB+.
- **No additional tasks needed** — zero boilerplate for pgvector helper; Drizzle's built-in API is sufficient

## Alternatives Considered

- **Custom column type via `customType()`:** Not needed — Drizzle has native `vector()` support since ~v0.28.
- **Raw SQL for all vector queries:** Not needed — `cosineDistance()` and other distance functions are available in `drizzle-orm`.
- **pgvector-node package:** Provides helpers for pgvector, but unnecessary when using Drizzle's built-in support. Would add an extra dependency.
- **IVFFlat index instead of HNSW:** IVFFlat requires training data and is less performant for small datasets. HNSW is the better choice when an index becomes necessary. Both are deferred for MVP.

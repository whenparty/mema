# 5.3 Tech Spikes

## Purpose

List of technical uncertainties requiring investigation before or at the start of implementation. Each spike has a specific question, success criterion, and impact on the backlog.

---

## Conventions

- **Priority:** P0 — blocks development start; P1 — blocks specific tasks; P2 — affects quality, does not block.
- **Status:** ⬜ todo · 🟡 in progress · ✅ done · ⛔ canceled
- **Effort:** S (< 2 hours), M (2–8 hours), L (1–3 days)
- **Traceability:** to FR/NFR and backlog tasks affected by the result.

---

## Spike 1 · Bun Compatibility with Key Dependencies

| | |
|---|---|
| **Priority** | P0 |
| **Effort** | M |
| **Status** | ⬜ |
| **Traceability** | Entire stack (4.4) |

### Question

Do grammy, pg-boss, and Drizzle ORM work correctly under Bun runtime? Are there critical incompatibilities with npm packages these libraries depend on?

### Context

Bun declares npm ecosystem compatibility, but in practice edge cases occur — especially with native modules and specific Node.js APIs (net, dgram, worker_threads). grammy uses HTTP/webhooks, pg-boss — pg-notify + polling, Drizzle — postgres driver.

### Success Criteria

- grammy: webhook mode works, messages are received and sent
- pg-boss: job is created, fires on schedule, retry works
- Drizzle: migrations run, CRUD operations work, pgvector type is supported via custom type

### Research Plan

1. Check documentation and issue trackers: grammy Bun compatibility, pg-boss Node.js API usage, Drizzle Bun support
2. Initialize a minimal Bun project with Elysia
3. Connect grammy in webhook mode → send and receive a test message
4. Connect Drizzle to PostgreSQL → run migration → CRUD
5. Connect pg-boss → create and execute a job
6. Document any workarounds found

### Impact on Backlog

Blocks all tasks. If Bun is incompatible with a critical dependency — decision: replace the library or migrate to Node.js (Elysia supports both runtimes).

---

## Spike 2 · Drizzle ORM + pgvector

| | |
|---|---|
| **Priority** | P0 |
| **Effort** | S |
| **Status** | ⬜ |
| **Traceability** | FR-MEM.6 (memory application), FR-MEM.8 (search), 4.4 Semantic Search |

### Question

How does pgvector work through Drizzle ORM? Is there native vector type support, or is a custom column type needed? What does a cosine similarity query look like through the Drizzle query builder?

### Context

Drizzle ORM is actively developed and may have native pgvector support via an extension. If not — a custom type and raw SQL for similarity queries will be required. This affects the amount of boilerplate code in Memory Service.

### Success Criteria

- Vector is saved and read through Drizzle
- Cosine similarity query (`<=>`) works via query builder or `sql` template
- Filtering by `user_id` + `status` + vector search in a single query

### Research Plan

1. Check Drizzle documentation for pgvector support (drizzle-orm/pgvector or community extensions)
2. If no native support — implement a custom column type
3. Write a test query: embedding insertion + similarity search with filters
4. Benchmark performance on 1K and 10K records

### Impact on Backlog

Affects Memory Service tasks (fact storage, semantic search). If native support is absent — an additional task for creating a custom pgvector helper is needed.

---

## Spike 3 · Combined LLM Extraction Call (structured output)

| | |
|---|---|
| **Priority** | P0 |
| **Effort** | L |
| **Status** | ⬜ |
| **Traceability** | FR-MEM.1 (extraction), FR-MEM.3 (entities), FR-MEM.4 (conflicts), FR-COM.5 (classification), 4.4 LLM Strategy |

### Question

Can a single compact model (GPT-5 nano / GPT-5 mini / Claude Haiku 4.5) reliably perform all pipeline step 4–8 tasks in one call: fact extraction + typing + temporal_sensitivity + entity resolution + conflict detection + intent and complexity classification + injection detection?

### Context

The architecture (4.4) assumes combining steps 4–8 into a single structured output call to optimize cost and latency. But this is a complex multitask instruction. Risk: when combined, individual subtask quality may degrade — the model "spreads" attention. The alternative is 2–3 calls with separated responsibilities, but more expensive.

### Success Criteria

- Fact extraction accuracy ≥ 85% on a test set (40 examples in English)
- Correct intent classification ≥ 90%
- Quality comparison: combined call vs separate calls

### Research Plan

1. Create a test set: 30+ messages covering all fact types, intents, conflicts, edge cases
2. Write a combined prompt with structured output
3. Run through GPT-5 nano, GPT-5 mini, and Claude Haiku 4.5
4. Evaluate the quality of each subtask separately
5. If quality is below threshold — try splitting into 2 calls (extraction + classification)
6. Document the optimal configuration and final prompt

### Impact on Backlog

Determines the number of LLM calls per message → affects cost, latency, and pipeline architecture. If the combined call doesn't pass quality — the LLM budget increases (~×1.5–2), pipeline tasks become more complex.

---

## Spike 4 · Multi-Model Generation: Latency and Validation Quality

| | |
|---|---|
| **Priority** | P1 |
| **Effort** | M |
| **Status** | ⬜ |
| **Traceability** | FR-COM.5 (multi-model generation), NFR-PERF.1 (response time), NFR-PERF.4 (parallel generation), NFR-REL.5 (degradation) |

### Question

What is the actual latency when generating in parallel with two powerful models + validation by a compact model? Does the validator add tangible value (catches real errors) or is it overhead?

### Context

The architecture assumes 3 LLM calls for a standard request: Model A + Model B in parallel, then Validator. NFR-PERF.1 allows up to 1–2 minutes, but UX expectations for a chat bot — the faster, the better. The question: does the validator justify the additional time and cost?

### Success Criteria

- Measure end-to-end latency on 20+ requests of varying complexity
- Assess: in which cases did the validator actually correct an error / improve the response
- Determine the threshold: at what latency does UX become unacceptable
- Decision: keep 3 models / reduce to 2 / make validation optional

### Research Plan

1. Prepare 20 test requests with memory context (including requests with potential hallucinations)
2. Implement a minimal prototype: Promise.allSettled for two models + validator
3. Measure latency at each stage
4. Assess quality: how many times did the validator actually catch an error
5. Compare with the variant without validator

### Impact on Backlog

May simplify response generation architecture (remove validator) and reduce cost by ~$4–8/month. Determines the structure of tasks in the "Response Generation" epic.

---

## Spike 5 · Semantic Search Quality in Russian

| | |
|---|---|
| **Priority** | P1 |
| **Effort** | M |
| **Status** | ⬜ |
| **Traceability** | FR-MEM.6 (memory application), FR-MEM.8 (search by topic), 4.4 Semantic Search |

### Question

Does text-embedding-3-small provide sufficient semantic search quality for short facts in Russian? How does it handle colloquial style, diminutive forms, mixed Russian-English text?

### Context

The primary language of users is Russian, but facts may contain anglicisms, transliteration, colloquial forms. The embedding model is trained multilingually, but quality in Russian may differ from English. With poor search quality — memory isn't applied, the North Star metric drops.

### Success Criteria

- Recall@5 ≥ 80% for direct queries ("what do you remember about my job?" → facts about work)
- Recall@5 ≥ 60% for indirect queries ("recommend a restaurant" → fact about city)
- Correct handling of colloquial Russian and mixed-language text

### Research Plan

1. Create a set of 50 facts (realistic, various types, Russian + mixed)
2. Create a set of 30 queries with expected relevant facts
3. Generate embeddings via text-embedding-3-small
4. Evaluate search quality (recall@5, recall@10)
5. If quality is insufficient — test text-embedding-3-large and alternatives
6. Determine the optimal K value for top-K

### Impact on Backlog

Determines the embedding model choice (affects cost). May require additional text preprocessing before embedding (normalization, cleaning). Affects Tier 2 context parameters.

---

## Spike 6 · RRULE Library for Bun

| | |
|---|---|
| **Priority** | P1 |
| **Effort** | S |
| **Status** | ⬜ |
| **Traceability** | FR-REM.2 (recurring reminders), 4.4 Reminder Service |

### Question

Which RRULE library (rrule.js, rrule-rust, others) works under Bun and correctly handles TZID + DST for IANA zones?

### Context

Recurring reminders store their schedule as RRULE with TZID. The library must: parse RRULE, compute next occurrence accounting for DST, work with IANA timezone names. rrule.js is the most popular but may have issues with Bun.

### Success Criteria

- Library installs and works under Bun
- Correct next occurrence calculation for: "every Monday at 10:00 Europe/Berlin" (including DST transition)
- Correct handling of complex patterns: "every third Thursday of the month"

### Research Plan

1. Check npm: rrule.js compatibility with Bun (issues, README), existence of Bun-native alternatives
2. Install rrule.js under Bun → test basic operations
3. Check DST: create RRULE with TZID Europe/Berlin, compute occurrences across daylight saving time transition
4. If rrule.js doesn't work — test alternatives (rrule-rust, temporal-polyfill + manual parsing)
5. Document the chosen library and known limitations

### Impact on Backlog

Determines the dependency in Reminder Service. If there are issues with rrule.js — additional task for integrating an alternative or a custom parser.

---

## Spike 7 · Per-User Serialization: Mechanism Selection

| | |
|---|---|
| **Priority** | P1 |
| **Effort** | S |
| **Status** | ⬜ |
| **Traceability** | FR-PLT.6 (per-user serialization), NFR-PERF.5, 4.4 Telegram Gateway |

### Question

Which per-user serialization mechanism is optimal: in-memory lock (Map with Promise chain), grammy middleware (session plugin with locking), pg-boss grouping?

### Context

The pipeline must process no more than one message from a single user at a time (FR-PLT.6) to avoid race conditions in memory and DialogState. Messages from different users are processed in parallel. For a single VPS instance, an in-memory solution is sufficient, but graceful restart must be considered.

### Success Criteria

- Guarantee: two messages from the same user are not processed in parallel
- Messages from different users don't block each other
- The solution is correct on application restart (no message loss)

### Research Plan

1. Implement an in-memory lock (Map<userId, Promise>) — evaluate simplicity and reliability
2. Check grammy session plugin — is there built-in support for sequential processing
3. Evaluate pg-boss grouping — overhead from DB calls on each message
4. Select and document the decision

### Impact on Backlog

Determines the pipeline entry point implementation. Affects the "Telegram Gateway" task.

---

## Spike 8 · pg-boss: Scheduling Precision and Production-Readiness

| | |
|---|---|
| **Priority** | P1 |
| **Effort** | S |
| **Status** | ⬜ |
| **Traceability** | FR-REM.1 (reminders), NFR-PERF.2 (precision ±1 min), 4.4 Reminder Scheduler |

### Question

Does pg-boss deliver ±1 minute precision when using `startAfter`? What is the optimal polling interval? How does it behave during downtime and recovery?

### Context

pg-boss is used as the scheduler for reminders and background tasks (summary rebuild, interest detection, evaluation). For reminders, delivery precision is critical (NFR-PERF.2: ±1 minute). pg-boss polls the DB with a configurable interval — too infrequent = delays, too frequent = unnecessary load.

### Success Criteria

- A job with `startAfter = now + 60s` fires within ±60 seconds
- With a polling interval of 10–30 seconds, DB load is negligible
- Missed jobs (during downtime) are delivered on recovery

### Research Plan

1. Configure pg-boss with different polling intervals (5s, 15s, 30s)
2. Create 10 jobs with a known `startAfter` → measure actual trigger time
3. Stop the application → wait for several jobs to trigger → start → check delivery
4. Evaluate PostgreSQL load during polling

### Impact on Backlog

Determines pg-boss configuration and polling interval. If precision is insufficient — a cron-based alternative or additional checking logic may be needed.

---

## Spike 9 · LLM-Generated RRULE from Natural Language

| | |
|---|---|
| **Priority** | P1 |
| **Effort** | M |
| **Status** | ⬜ |
| **Traceability** | FR-REM.2 (recurring reminders), 4.4 LLM Strategy |

### Question

How reliably does a compact model (GPT-5 nano / GPT-5 mini / Claude Haiku 4.5) convert natural language requests into valid RRULE strings? Which patterns are problematic?

### Context

Users specify schedules in free-form text: "every Monday at 10," "every third Thursday," "the last day of the month," "every two weeks on Tuesdays." The LLM must convert this to a valid RRULE with TZID. An error in the RRULE → reminder at the wrong time → loss of user trust.

### Success Criteria

- Correct RRULE generation for 90%+ of typical patterns (daily, weekly, monthly, by day of week)
- Correct TZID handling
- Identification of patterns that require validation or user clarification

### Research Plan

1. Create a set of 25+ requests: simple (every day), medium (every third Thursday), complex (last Friday of the month), ambiguous ("once a month")
2. Run through GPT-5 nano, GPT-5 mini, and Claude Haiku 4.5 with an RRULE generation prompt
3. Validate the result through the RRULE library (from Spike 6)
4. Determine: which patterns are reliable, which require additional validation

### Impact on Backlog

Determines the need for an RRULE validation layer. May add a task: RRULE verification through reverse conversion (RRULE → text → user confirmation for complex patterns).

---

## Spike 10 · Sentry + Bun Integration

| | |
|---|---|
| **Priority** | P2 |
| **Effort** | S |
| **Status** | ⬜ |
| **Traceability** | NFR-OBS.2 (monitoring), 4.4 Monitoring |

### Question

Does `@sentry/bun` work stably? Does it catch unhandled exceptions, promise rejections? Is it compatible with Elysia error handling?

### Context

Sentry is a key monitoring component (NFR-OBS.2). `@sentry/bun` is relatively new — it may have limitations compared to `@sentry/node`.

### Success Criteria

- Unhandled exception is sent to Sentry with a correct stack trace
- Promise rejection is sent
- Errors inside Elysia route handlers are caught
- Source maps work (or a workaround is identified)

### Research Plan

1. Check Sentry docs: `@sentry/bun` status, known limitations, Elysia integration guides
2. Install `@sentry/bun` in a test project
3. Throw an unhandled exception → verify in Sentry dashboard
4. Throw an error inside an Elysia handler → verify
5. Check source maps for TypeScript

### Impact on Backlog

If issues arise — fallback to `@sentry/node` or an alternative (Axiom, Baselime). Does not block development, but affects the "Monitoring" task.

---

## Spike 11 · Webhook vs Long Polling for grammy on VPS

| | |
|---|---|
| **Priority** | P2 |
| **Effort** | S |
| **Status** | ⬜ |
| **Traceability** | FR-PLT.1 (Telegram bot), 4.4 Telegram Gateway |

### Question

Webhook (requires HTTPS endpoint) or long polling (simpler to set up) for the Telegram Gateway on BinaryLane VPS? Which option is simpler in production operation?

### Context

4.4 specifies "webhook mode (HTTPS available)," but a VPS requires an SSL certificate (Let's Encrypt + domain or self-signed). Long polling doesn't require a public endpoint but is potentially less responsive and doesn't allow scaling to multiple instances (not relevant for MVP).

### Success Criteria

- Optimal mode for MVP on VPS determined
- If webhook — SSL setup process documented
- If long polling — acceptable latency confirmed

### Research Plan

1. Evaluate the complexity of webhook setup: Let's Encrypt + Caddy/nginx reverse proxy vs grammy self-signed
2. Test long polling via grammy: message delivery latency
3. Document the decision and configuration

### Impact on Backlog

Determines the "Telegram Gateway Setup" task and Docker Compose configuration (whether a reverse proxy is needed).

---

## Summary Table

| # | Spike | Priority | Effort | Blocks |
|---|-------|----------|--------|--------|
| 1 | Bun compatibility with dependencies | P0 | M | Everything |
| 2 | Drizzle + pgvector | P0 | S | Memory Service |
| 3 | Combined LLM extraction call | P0 | L | Pipeline, LLM budget |
| 4 | Multi-model generation | P1 | M | Response generation |
| 5 | Semantic search in Russian | P1 | M | Memory retrieval |
| 6 | RRULE library for Bun | P1 | S | Reminder Service |
| 7 | Per-user serialization | P1 | S | Telegram Gateway |
| 8 | pg-boss precision | P1 | S | Reminder scheduling |
| 9 | LLM-generated RRULE | P1 | M | Reminder creation |
| 10 | Sentry + Bun | P2 | S | Monitoring |
| 11 | Webhook vs Long Polling | P2 | S | Telegram Gateway config |

---

## Recommended Execution Order

**Week 0 (before main development starts):**
1. Spike 1 (Bun + dependencies) — gate-keeper, can't start without it
2. Spike 2 (Drizzle + pgvector) — executed in parallel with Spike 1
3. Spike 11 (Webhook vs Polling) — quick, determines infra setup

**Week 1 (in parallel with Project Setup):**
4. Spike 3 (Combined extraction call) — most labor-intensive, determines pipeline architecture
5. Spike 7 (Per-user serialization) — quick, needed for Telegram Gateway
6. Spike 6 (RRULE library) — quick, needed for Reminder Service

**Week 2 (in parallel with first iteration):**
7. Spike 5 (Semantic search in Russian) — after real facts exist in the DB
8. Spike 4 (Multi-model generation) — after basic pipeline
9. Spike 8 (pg-boss precision) — after pg-boss setup
10. Spike 9 (LLM RRULE) — after Spike 6
11. Spike 10 (Sentry + Bun) — any time

---

## Decisions Deferred to Phase 6

The following questions, marked "to be determined during implementation" in project documentation, do not require separate tech spikes and are resolved during implementation:

| Question | Source | Why Not a Spike |
|----------|--------|-----------------|
| Specific token quota value | FR-PLT.4, NFR-SEC.2 | Determined empirically after launch on real data |
| Auto-update timezone triggers | FR-REM.6 | Not critical for MVP launch, manual update is sufficient |
| Specific pg-boss polling interval | 4.4 | Determined based on Spike 8 results |
| K value for top-K semantic search | 4.4 | Determined based on Spike 5 results |
| Threshold for "stale" messages on retry | NFR-REL.3 | Set at 5 minutes, adjusted during operation |

---

## Traceability to Artifacts

| Spike | FR / NFR | Artifact |
|-------|----------|----------|
| 1 | Entire stack | 4.4 System Architecture |
| 2 | FR-MEM.6, FR-MEM.8 | 4.3 Data Model, 4.4 Semantic Search |
| 3 | FR-MEM.1, FR-MEM.3, FR-MEM.4, FR-COM.5 | 4.4 LLM Strategy |
| 4 | FR-COM.5, NFR-PERF.1, NFR-PERF.4, NFR-REL.5 | 4.4 Multi-Model Generation |
| 5 | FR-MEM.6, FR-MEM.8 | 4.4 Semantic Search |
| 6 | FR-REM.2 | 4.4 Reminder Service |
| 7 | FR-PLT.6, NFR-PERF.5 | 4.4 Telegram Gateway |
| 8 | FR-REM.1, NFR-PERF.2 | 4.4 Reminder Scheduler |
| 9 | FR-REM.2 | 4.4 LLM Strategy |
| 10 | NFR-OBS.2 | 4.4 Monitoring |
| 11 | FR-PLT.1 | 4.4 Telegram Gateway |

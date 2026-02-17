# Mema — Memory Assistant

Personal AI assistant Telegram bot where memory is the core product, not a feature.
Remembers meaningful facts from natural conversation, uses them contextually,
and gives users full control over what has been remembered.

---

## Tech Stack

| Layer | Technology | Purpose |
|-------|-----------|---------|
| Runtime | Bun | High performance, built-in TypeScript, npm compatibility |
| Language | TypeScript | Strong typing, single language across the stack |
| Framework | Elysia.js | End-to-end type safety, built-in validation, Bun-native |
| Database | PostgreSQL + pgvector | Relational data + semantic vector search in one DB |
| ORM | Drizzle ORM | TypeScript-first, Bun-compatible, Drizzle Studio |
| Job Queue | pg-boss | PostgreSQL-based scheduler, no Redis needed |
| Telegram | grammy | TypeScript-native Telegram Bot API framework |
| LLM | OpenAI + Anthropic | Custom abstraction over multiple providers |
| Embedding | text-embedding-3-small | 1536 dimensions, $0.02/M tokens |
| Logging | pino | Structured JSON logs |
| Error Monitoring | Sentry (@sentry/bun) | Runtime error tracking and alerts |
| Hosting | BinaryLane VPS + Docker | 2 vCPU, 4 GB RAM, two containers (app + PostgreSQL) |
| CI/CD | GitHub Actions | Automated build, test, deploy |

---

## Directory Structure

```
mema/
├── .github/workflows/        CI/CD pipeline definitions
├── docs/specification/        Product specification documents (17 files)
├── .claude/skills/            Claude Code skill definitions
├── drizzle/                   Drizzle ORM migration files
├── prompts/                   Prompt templates (*.ftl), separated from code (NFR-PORT.1)
│   ├── extraction/            Fact extraction + entity resolution + conflict detection
│   ├── generation/            Response generation (Model A, Model B, validator)
│   ├── evaluation/            LLM-as-judge evaluation prompts
│   ├── summary/               User summary rebuild prompts
│   ├── interest/              Interest detection prompts
│   └── reminder/              RRULE parsing and reminder context prompts
├── scripts/                   Utility scripts (DB seed, backup, deployment)
├── src/
│   ├── app.ts                 Application entry point (Elysia server + health check)
│   ├── domain/                Business logic — pure domain, no infra dependencies
│   │   ├── memory/
│   │   │   ├── extraction/    Fact extraction, entity resolution, conflict detection
│   │   │   ├── retrieval/     Semantic search (pgvector), tiered memory, context formation
│   │   │   ├── management/    Fact editing, deletion, cascade operations
│   │   │   └── summary/       User summary rebuild logic
│   │   ├── reminder/          Reminder creation, RRULE handling, delivery, timezone
│   │   ├── dialog/
│   │   │   ├── state-manager.ts   Dialog state machine (IDLE/CONFIRM/AWAIT)
│   │   │   ├── types.ts           Dialog state types and context discriminators
│   │   │   └── handlers/          Per-state response handlers (conflict, delete, etc.)
│   │   ├── interest/          Interest detection from query patterns (FR-MEM.15)
│   │   ├── generation/        Multi-model response generation and validation
│   │   └── evaluation/
│   │       ├── judge.ts       LLM-as-judge evaluation logic
│   │       └── handlers/      Extraction accuracy and application relevance handlers
│   ├── infra/                 Infrastructure adapters — external services
│   │   ├── db/
│   │   │   ├── client.ts      Database connection setup
│   │   │   ├── schema.ts      Re-export barrel for all schema modules
│   │   │   └── schema/        Drizzle table definitions (one file per entity)
│   │   ├── llm/
│   │   │   ├── provider.ts    LLMProvider interface definition
│   │   │   ├── providers/     OpenAI and Anthropic adapter implementations
│   │   │   ├── prompt-loader.ts  FTL template loader
│   │   │   └── embedding.ts   Embedding generation via OpenAI
│   │   ├── jobs/
│   │   │   ├── registry.ts    pg-boss job registration and configuration
│   │   │   └── handlers/      Job handlers (summary rebuild, interest detection, etc.)
│   │   ├── monitoring/        Sentry setup, health check, structured log config
│   │   └── config.ts          Environment variable loading and validation
│   ├── gateway/               Delivery channel adapters
│   │   └── telegram/
│   │       ├── bot.ts         grammy bot setup and webhook configuration
│   │       ├── commands/      /start, /help, /stop command handlers
│   │       ├── middleware/    Per-user serialization, rate limiting, typing indicator
│   │       └── admin/         /admin_block, /admin_unblock, /admin_approve, /admin_stats
│   ├── pipeline/              Message processing pipeline (12 steps)
│   │   ├── orchestrator.ts    Sequential step executor with error handling
│   │   ├── types.ts           Pipeline context and step interface types
│   │   ├── router.ts          Intent-based routing to domain handlers
│   │   └── steps/             Individual pipeline step implementations
│   └── shared/                Cross-cutting utilities
│       ├── errors.ts          Custom error classes
│       ├── logger.ts          pino logger configuration
│       └── types.ts           Shared enums, interfaces, type definitions
├── tests/eval/                Synthetic "message -> expected facts" test sets
├── AGENTS.md                  This file — project instructions
├── CLAUDE.md                  Symlink to AGENTS.md
├── .env.example               Environment variable template
└── .gitignore                 Git ignore rules
```

---

## Current Sprint

Milestone: M0 · Spikes & Foundation
Target: 2026-03-07
In progress: —
Completed: TASK-0.1 (Bun runtime compatibility), TASK-0.2 (Drizzle + pgvector), TASK-0.3 (Combined LLM extraction call)
Blocked: —
Decisions pending: 8 spikes (see docs/decisions/README.md)

---

## Spike Results

Full write-ups: `docs/decisions/NNN-*.md` | Index: `docs/decisions/README.md`

| Spike | Decision | Status |
|-------|----------|--------|
| TASK-0.1 | ✅ Bun 1.3 works with grammy, pg-boss, Drizzle+pgvector — no blockers | accepted |
| TASK-0.2 | ✅ Native vector() + cosineDistance() in Drizzle — no custom types, brute-force <5ms at 1K facts | accepted |
| TASK-0.3 | ✅ Combined call works — Claude Haiku 4.5 best (83.7% score, 2.2s, 100% intent/injection), prompt iteration needed for 85% fact target | accepted |
| TASK-0.4 | Multi-model generation | pending |
| TASK-0.5 | Semantic search (Russian) | pending |
| TASK-0.6 | RRULE library for Bun | pending |
| TASK-0.7 | Per-user serialization | pending |
| TASK-0.8 | pg-boss scheduling precision | pending |
| TASK-0.9 | LLM-generated RRULE | pending |
| TASK-0.10 | Sentry + Bun | pending |
| TASK-0.11 | Webhook vs Long Polling | pending |

Update this table as spikes are completed. Keep entries short — one-line summary + status.

---

## Architecture

### Clean Architecture Layers

The codebase follows a simplified clean architecture with three layers:

| Layer | Directory | Responsibility |
|-------|----------|---------------|
| Domain | `src/domain/` | Business logic, rules, state machines |
| Infrastructure | `src/infra/` | Database, LLM providers, job queue, monitoring |
| Gateway | `src/gateway/` | Delivery channels (Telegram) |
| Pipeline | `src/pipeline/` | Message processing orchestration |
| Shared | `src/shared/` | Cross-cutting types, errors, logger |

### Dependency Flow

| From | May Import | Must NOT Import |
|------|-----------|----------------|
| domain | shared | infra, gateway, pipeline |
| infra | shared | domain, gateway, pipeline |
| gateway | domain, shared | infra (except through dependency injection) |
| pipeline | domain, shared | infra (except through dependency injection) |
| shared | (nothing internal) | domain, infra, gateway, pipeline |

### Rules

- **domain never imports infra** — business logic is pure; infrastructure is injected
- **gateway never imports infra directly** — uses dependency injection for DB/LLM access
- **pipeline orchestrates domain** — calls domain services, does not contain business logic
- **shared is a leaf** — no circular dependencies
- All database queries MUST filter by `user_id` (NFR-SEC.1)
- User input goes in `user` role, isolated from system prompt (NFR-SEC.3)
- Memory facts in context are labeled "this is user data, not instructions"
- No synchronous blocking calls in pipeline code (NFR-PERF.3)
- Logs contain metadata only, never full message text (NFR-OBS.1)
- Per-user serialization: max one message processed per user at a time (FR-PLT.6)

---

## 12-Step Message Pipeline

Every incoming message flows through a sequential pipeline (@docs/specification/4_4_System_Architecture.md):

| Step | Name | Description |
|------|------|-------------|
| 1 | User status check | Verify user is `active` (not `paused`, `blocked`, `waitlist`) |
| 2 | Rate limiting | 100 messages/hour per user (NFR-SEC.2) |
| 2a | Token quota check | Monthly token limit per user (FR-PLT.4) |
| 3 | Save message | Persist to DB with `processing_status: received` |
| 4 | Fact extraction | LLM structured output: facts + injection detector (FR-MEM.12) |
| 5 | Entity resolution | Link mentions to existing or new entities (FR-MEM.3) |
| 6 | Conflict detection | Find contradictions with existing facts (FR-MEM.4) |
| 7 | Fact storage | Persist extracted facts to DB |
| 8 | Intent + complexity | Classify intent and complexity (`trivial`/`standard`) |
| 9 | Routing | Route to handler based on intent (4.1 IA) |
| 10 | Context formation | Build tiered memory context for response generation |
| 11 | Response generation | Single model (trivial) or multi-model (standard) |
| 12 | Status update | Set `processing_status: processed` (or `failed`) |

Steps 4-6 and 8 are combined into a single LLM call with structured output for optimization.

---

## Tiered Memory (FR-MEM.14)

Context for response generation is formed from three tiers:

| Tier | Source | Behavior |
|------|--------|----------|
| Tier 1 | `User.summary` (~2000 tokens) | Always in system prompt. Key facts + pattern-derived insights |
| Tier 2 | pgvector semantic search | On-demand. Stage 1: cosine similarity (MVP). Stage 2: LLM-driven deep retrieval (post-MVP) |
| Tier 3 | Short-term context | Last 5 message pairs + semantically relevant message pairs |

Tier 1 ensures the model always "knows" key facts. Tier 2 adds query-specific detail. Tier 3 maintains conversational coherence.

---

## Multi-Model Generation (FR-COM.5)

| Complexity | Strategy | LLM Calls |
|-----------|----------|-----------|
| Trivial | 1 compact (analysis) + 1 powerful (response) | 2 |
| Standard | 1 compact (analysis) + 2 powerful in parallel + 1 compact validator | 4 |

For standard requests: Model A (Claude) and Model B (GPT) generate responses in parallel via `Promise.allSettled()`. A compact validator checks both for factual errors and synthesizes the final response.

**Degradation:** if one provider is unavailable, the other's response is sent without validation. If both fail — retry with exponential backoff, then error message to user (NFR-REL.5).

### LLM Models

| Task | Model Class | Configured Via |
|------|------------|---------------|
| Analysis, extraction, classification | Compact | `LLM_COMPACT_MODEL` |
| Response generation (A) | Powerful | `LLM_POWERFUL_MODEL_A` |
| Response generation (B) | Powerful | `LLM_POWERFUL_MODEL_B` |
| Response validation | Compact | `LLM_VALIDATOR_MODEL` |
| Embedding | Embedding | `LLM_EMBEDDING_MODEL` |

Models are read from env on each call — swappable without restart.

---

## Dialog States

| State | context.type | Trigger | Expected Response |
|-------|-------------|---------|-------------------|
| IDLE | -- | Default | Any message -> intent classification |
| CONFIRM | conflict | Implicit contradiction detected | Confirm change / deny / clarify |
| CONFIRM | delete | Fact or entity deletion requested | Confirm / cancel |
| CONFIRM | account_delete | Account deletion requested | Confirm irreversible deletion / cancel |
| CONFIRM | interest | Promoted interest candidate matches topic | Confirm save as preference / dismiss |
| AWAIT | missing_data | Missing city, date, timezone, etc. | Provide missing information |

Reset: 30-min timeout or off-topic message. On timeout, the user receives a notification.

---

## Data Entities

User, UserAuth, Entity, FactEntity, Fact, Reminder, Message,
DialogState, Evaluation, InterestScan, InterestCandidate, TokenUsage

Full schema: @docs/specification/4_3_Data_Model.md

---

## Intent Taxonomy

| Category | Intents | Description |
|----------|---------|-------------|
| memory | save, view, edit, delete, delete_entity, explain | Memory operations |
| reminder | create, list, cancel, edit | Reminder management |
| chat | (single intent) | Everything else — pipeline decides memory relevance |
| system | delete_account, pause, resume | Account management |

Full routing logic: @docs/specification/4_1_Information_Architecture.md

---

## Code Conventions

- Named exports only, no default exports
- `interface` over `type` for object shapes
- No `any` — use `unknown` with type guards
- Early returns over nested conditions
- Functions under 30 lines when possible
- Descriptive variable names (no single-letter except loop indices)
- US English spelling in all code, comments, and documentation
- Prompts in `prompts/*.ftl`, separated from processing code (NFR-PORT.1)

## Testing Conventions

- TDD: failing test -> implementation -> refactor
- Colocated tests: `foo.ts` -> `foo.test.ts` in the same directory
- Test behavior, not implementation details
- `tests/eval/` — synthetic "message -> expected facts" pairs for extraction quality regression
- Evaluation: every 5th message is sent for async LLM-as-judge assessment

## Git Conventions

- Conventional commits: `feat|fix|refactor|chore|docs|test(scope): message`
- Atomic commits — one logical change per commit
- Run tests before committing

---

## Commands

```bash
bun install              # Install dependencies
bun run dev              # Start development server
bun run build            # Build for production
bun run start            # Start production server
bun run db:generate      # Generate Drizzle migrations
bun run db:migrate       # Run migrations
bun run db:studio        # Open Drizzle Studio
bun test                 # Run tests
bun run lint             # Run linter
bun run typecheck        # Run TypeScript type checking
bun run format           # Format code
```

> Commands will be functional after `package.json` setup.

- /project:status — show current sprint status from GitHub issues

---

## Specification Reference

- @docs/specification/4_4_System_Architecture.md — tech stack, components, LLM strategy, deployment
- @docs/specification/4_3_Data_Model.md — all entities, fields, relationships
- @docs/specification/4_1_Information_Architecture.md — intents, routing, dialog states, pipeline
- @docs/specification/4_2_Conversation_Design.md — bot personality, example dialogs, tone
- @docs/specification/3_1_Functional_Requirements.md — all FR with priorities
- @docs/specification/3_2_Non-Functional_Requirements.md — performance, security, cost, portability
- @docs/specification/3_3_User_Stories_Acceptance_Criteria.md — user stories with Given/When/Then
- @docs/specification/3_4_User_Flow.md — user flow diagrams
- @docs/specification/2_1_Product_Vision_Statement.md — product vision
- @docs/specification/2_2_Goals_Success_Metrics.md — goals and success metrics
- @docs/specification/2_3_Scope_In_Out.md — scope definition (in/out)
- @docs/specification/5_1_Backlog.md — product backlog
- @docs/specification/5_2_Milestones.md — delivery milestones
- @docs/specification/5_3_Tech_Spikes.md — technical spikes

# 5.1 Backlog

## Purpose

Prioritized task list for MVP implementation. Two levels: epics for overview, tasks for execution. Each task is ready to be imported into GitHub Issues.

---

## Conventions

- **Priority:** P0 — blocks MVP launch; P1 — important, implemented if resources allow; P2 — desirable, may be deferred.
- **Estimate:** in hours, approximate. Includes writing code, tests, debugging. Does not include code review (solo developer).
- **Dependencies:** tasks that must be completed before the current one can begin.
- **Traceability:** to FR/NFR/US from project documentation.
- **Numbering:** EPIC-{number}, TASK-{epic}.{number}
- **Labels (for GitHub):** `epic`, `spike`, `infra`, `feature`, `bug`, `chore`

---

## Epic Overview

| # | Epic | Tasks | Estimate | Priority |
|---|------|-------|----------|----------|
| 0 | Tech Spikes | 12 | 40 h | P0–P2 |
| 1 | Project Setup & Infrastructure | 7 | 20 h | P0 |
| 2 | Telegram Gateway | 4 | 12 h | P0 |
| 3 | LLM Abstraction Layer | 4 | 14 h | P0 |
| 4 | Message Pipeline (Core) | 6 | 20 h | P0 |
| 5 | Memory — Extraction | 7 | 30 h | P0 |
| 6 | Memory — Retrieval & Application | 6 | 24 h | P0 |
| 7 | Memory — Management | 6 | 18 h | P0 |
| 8 | Reminders | 7 | 28 h | P0 |
| 9 | Response Generation | 5 | 20 h | P0 |
| 10 | Onboarding & Access Control | 5 | 10 h | P0 |
| 11 | Admin & Monitoring | 6 | 16 h | P0–P1 |
| 12 | Evaluation & Quality | 4 | 14 h | P1 |
| 13 | Interest Detection | 4 | 16 h | P1 |
| | **Total** | **83** | **~282 h** | |

---

## EPIC-0 · Tech Spikes

> Resolving technical uncertainties. Details are in artifact 5.3 Tech Spikes.

Spikes are included in the backlog as tasks for tracking in GitHub Issues. Descriptions, research plans, and success criteria are in 5.3.

| ID | Task | Priority | Estimate | Dependencies |
|----|------|----------|----------|--------------|
| TASK-0.1 | Spike: Bun compatibility with dependencies | P0 | 4 h | — |
| TASK-0.2 | Spike: Drizzle ORM + pgvector | P0 | 2 h | — |
| TASK-0.3 | Spike: Combined LLM extraction call | P0 | 8 h | — |
| TASK-0.3-ext | Spike: Entity confidence classification test | P0 | 4 h | TASK-0.3 |
| TASK-0.4 | Spike: Multi-model generation (latency + quality) | P1 | 4 h | — |
| TASK-0.5 | Spike: Semantic search in Russian | P1 | 4 h | — |
| TASK-0.6 | Spike: RRULE library for Bun | P1 | 2 h | TASK-0.1 |
| TASK-0.7 | Spike: Per-user serialization | P1 | 2 h | TASK-0.1 |
| TASK-0.8 | Spike: pg-boss scheduling precision | P1 | 2 h | TASK-0.1 |
| TASK-0.9 | Spike: LLM-generated RRULE | P1 | 4 h | TASK-0.6 |
| TASK-0.10 | Spike: Sentry + Bun integration | P2 | 2 h | TASK-0.1 |
| TASK-0.11 | Spike: Webhook vs Long Polling | P2 | 2 h | TASK-0.1 |

---

## EPIC-1 · Project Setup & Infrastructure

> Repository, CI/CD, Docker, database, base configurations. The foundation everything else is built on.

| ID | Task | P | Estimate | Dependencies | Traceability | Labels |
|----|------|---|----------|--------------|--------------|--------|
| TASK-1.1 | Repository initialization | P0 | 3 h | TASK-0.1 | 4.4 | `infra` |
| TASK-1.2 | Docker Compose: app + PostgreSQL | P0 | 3 h | TASK-1.1 | 4.4, NFR-REL.1 | `infra` |
| TASK-1.3 | DB schema (Drizzle migrations) | P0 | 4 h | TASK-1.2, TASK-0.2 | 4.3 Data Model | `infra` |
| TASK-1.4 | CI/CD: GitHub Actions | P0 | 3 h | TASK-1.2 | 4.4 CI/CD | `infra` |
| TASK-1.5 | Database backup | P0 | 3 h | TASK-1.2 | NFR-REL.2 | `infra` |
| TASK-1.6 | Structured logging (pino) | P0 | 2 h | TASK-1.1 | NFR-OBS.1 | `infra` |
| TASK-1.7 | Environment configuration | P0 | 2 h | TASK-1.1 | 4.4 | `infra` |

Detailed AC for each task — in the full version (GitHub Issues).

---

## EPIC-2 · Telegram Gateway

> Receiving and sending messages. Isolated from business logic.

| ID | Task | P | Estimate | Dependencies | Traceability | Labels |
|----|------|---|----------|--------------|--------------|--------|
| TASK-2.1 | Basic Telegram Gateway (grammy) | P0 | 3 h | TASK-1.1, TASK-0.1, TASK-0.11 | FR-PLT.1, NFR-PORT.2 | `feature` |
| TASK-2.2 | Per-user serialization | P0 | 3 h | TASK-2.1, TASK-0.7 | FR-PLT.6, NFR-PERF.5 | `feature` |
| TASK-2.3 | Typing indicator and interim messages | P1 | 2 h | TASK-2.1 | NFR-PERF.1 | `feature` |
| TASK-2.4 | Idempotent processing (update_id) | P0 | 4 h | TASK-2.1, TASK-1.3 | NFR-REL.3 | `feature` |

---

## EPIC-3 · LLM Abstraction Layer

> Unified interface for working with LLM providers. Separating prompts from code.

| ID | Task | P | Estimate | Dependencies | Traceability | Labels |
|----|------|---|----------|--------------|--------------|--------|
| TASK-3.1 | LLMProvider interface | P0 | 4 h | TASK-1.1, TASK-1.7 | NFR-PORT.1, 4.4 | `feature` |
| TASK-3.2 | Token counting and usage tracking | P0 | 3 h | TASK-3.1, TASK-1.3 | FR-PLT.4, NFR-SEC.2 | `feature` |
| TASK-3.3 | Prompts: storage and loading | P0 | 3 h | TASK-3.1 | NFR-PORT.1, 4.4 | `feature` |
| TASK-3.4 | Embedding service | P0 | 4 h | TASK-3.1, TASK-0.2 | FR-MEM.6, 4.4 | `feature` |

**TASK-3.1 AC (key):**
- OpenAI provider: chat (GPT-5 nano, GPT-5 mini, GPT-5.2), embed (text-embedding-3-small)
- Anthropic provider: chat (Claude Haiku 4.5, Claude Opus 4.6)
- Structured output: JSON schema
- Model from env on each call
- Retry: 3 attempts with exponential backoff

---

## EPIC-4 · Message Pipeline (Core)

> Message processing skeleton: from input to response. Steps 1–3, 8–9, 12 from the canonical pipeline (4.4).

| ID | Task | P | Estimate | Dependencies | Traceability | Labels |
|----|------|---|----------|--------------|--------------|--------|
| TASK-4.1 | Pipeline orchestrator | P0 | 4 h | TASK-2.1, TASK-1.3, TASK-1.6 | 4.4 Pipeline, 4.1 IA | `feature` |
| TASK-4.2 | Intent and complexity classification | P0 | 4 h | TASK-4.1, TASK-3.1, TASK-0.3 | 4.1 IA, FR-COM.5 | `feature` |
| TASK-4.3 | Routing to handlers | P0 | 3 h | TASK-4.2 | 4.1 IA | `feature` |
| TASK-4.4 | Dialog State Manager | P0 | 4 h | TASK-1.3 | 4.1 IA, 4.3 DialogState | `feature` |
| TASK-4.5 | Rate limiting | P0 | 2 h | TASK-4.1 | FR-PLT.4, NFR-SEC.2 | `feature` |
| TASK-4.6 | Token quota check | P0 | 3 h | TASK-4.1, TASK-1.3, TASK-3.2 | FR-PLT.4, NFR-COST.2 | `feature` |

---

## EPIC-5 · Memory — Extraction

> Extracting facts from messages. Pipeline steps 4–7.

| ID | Task | P | Estimate | Dependencies | Traceability | Labels |
|----|------|---|----------|--------------|--------------|--------|
| TASK-5.1 | Fact extraction (step 4) | P0 | 6 h | TASK-3.1, TASK-3.3, TASK-0.3 | FR-MEM.1, FR-MEM.2 | `feature` |
| TASK-5.2 | Injection detector (step 4) | P0 | 3 h | TASK-5.1 | FR-MEM.12, NFR-SEC.3 | `feature` |
| TASK-5.3 | Entity resolution and creation (step 5) | P0 | 5 h | TASK-5.1, TASK-1.3 | FR-MEM.3 | `feature` |
| TASK-5.4 | Conflict detection (step 6) | P0 | 5 h | TASK-5.3, TASK-4.4 | FR-MEM.4, 4.1 IA | `feature` |
| TASK-5.5 | Fact persistence (step 7) | P0 | 3 h | TASK-5.4, TASK-3.4 | FR-MEM.1, FR-MEM.2 | `feature` |
| TASK-5.6 | Fact enrichment (soft ask) | P1 | 3 h | TASK-5.5, TASK-9.1 | FR-MEM.1 | `feature` |
| TASK-5.7 | User Summary rebuild trigger | P0 | 2 h | TASK-5.5, TASK-6.4 | FR-MEM.14 | `feature` |

---

## EPIC-6 · Memory — Retrieval & Application

> Searching for relevant facts, building context, User Summary.

| ID | Task | P | Estimate | Dependencies | Traceability | Labels |
|----|------|---|----------|--------------|--------------|--------|
| TASK-6.1 | Semantic search over facts (Tier 2) | P0 | 4 h | TASK-3.4, TASK-5.5, TASK-0.5 | FR-MEM.6, FR-MEM.8 | `feature` |
| TASK-6.2 | Short-term context (Tier 3) | P0 | 4 h | TASK-1.3, TASK-3.4 | 4.4 Tiered Memory | `feature` |
| TASK-6.3 | Tiered Memory context assembly | P0 | 3 h | TASK-6.1, TASK-6.2 | FR-MEM.14, 4.4 | `feature` |
| TASK-6.4 | User Summary rebuild (pg-boss) | P0 | 5 h | TASK-3.1, TASK-1.3, TASK-0.8 | FR-MEM.14, 4.4 | `feature` |
| TASK-6.5 | Freshness check (temporal_sensitivity) | P1 | 3 h | TASK-6.3 | FR-MEM.6 | `feature` |
| TASK-6.6 | Memory explain handler | P0 | 2 h | TASK-6.3, TASK-4.3 | FR-MEM.13 | `feature` |

---

## EPIC-7 · Memory — Management

> Viewing, editing, deleting facts through dialog.

| ID | Task | P | Estimate | Dependencies | Traceability | Labels |
|----|------|---|----------|--------------|--------------|--------|
| TASK-7.1 | Memory viewing (memory.view) | P0 | 3 h | TASK-6.1, TASK-4.3 | FR-MEM.7, FR-MEM.8 | `feature` |
| TASK-7.2 | Fact change history | P1 | 2 h | TASK-7.1 | FR-MEM.2a | `feature` |
| TASK-7.3 | Fact editing (memory.edit) | P0 | 3 h | TASK-5.5, TASK-4.3 | FR-MEM.9 | `feature` |
| TASK-7.4 | Fact deletion (memory.delete) | P0 | 3 h | TASK-4.4, TASK-4.3 | FR-MEM.10 | `feature` |
| TASK-7.5 | Cascading entity deletion | P0 | 4 h | TASK-7.4 | FR-MEM.11 | `feature` |
| TASK-7.6 | Account deletion | P0 | 3 h | TASK-4.4, TASK-1.3 | FR-PLT.3 | `feature` |

---

## EPIC-8 · Reminders

> Creating, managing, and delivering reminders.

| ID | Task | P | Estimate | Dependencies | Traceability | Labels |
|----|------|---|----------|--------------|--------------|--------|
| TASK-8.1 | Timezone detection | P0 | 3 h | TASK-3.1, TASK-5.5, TASK-4.4 | FR-REM.6 | `feature` |
| TASK-8.2 | One-time reminders | P0 | 4 h | TASK-8.1, TASK-3.1, TASK-0.8 | FR-REM.1 | `feature` |
| TASK-8.3 | Recurring reminders | P0 | 5 h | TASK-8.2, TASK-0.6, TASK-0.9 | FR-REM.2 | `feature` |
| TASK-8.4 | Memory-based reminders | P0 | 3 h | TASK-8.2, TASK-6.1 | FR-REM.7 | `feature` |
| TASK-8.5 | Reminder delivery (pg-boss) | P0 | 5 h | TASK-8.2, TASK-2.1 | FR-REM.3, NFR-REL.4 | `feature` |
| TASK-8.6 | Reminder management | P0 | 4 h | TASK-8.2, TASK-4.4 | FR-REM.4 | `feature` |
| TASK-8.7 | Timezone update on relocation | P1 | 4 h | TASK-8.1, TASK-5.4 | FR-REM.6 | `feature` |

---

## EPIC-9 · Response Generation

> Response generation: multi-model generation, web search, guardrails.

| ID | Task | P | Estimate | Dependencies | Traceability | Labels |
|----|------|---|----------|--------------|--------------|--------|
| TASK-9.1 | Basic response generation (single model) | P0 | 4 h | TASK-6.3, TASK-3.1, TASK-3.3 | FR-COM.1, FR-COM.5 | `feature` |
| TASK-9.2 | Multi-model generation | P0 | 5 h | TASK-9.1, TASK-0.4 | FR-COM.5, NFR-PERF.4, NFR-REL.5 | `feature` |
| TASK-9.3 | Web search via LLM tool calling | P0 | 4 h | TASK-9.1 | FR-COM.2 | `feature` |
| TASK-9.4 | Advisory Guardrails prompt | P0 | 3 h | TASK-9.1 | FR-COM.6 | `feature` |
| TASK-9.5 | Contextual suggestion and soft ask rule | P1 | 4 h | TASK-9.1 | 4.2 Conversation Design | `feature` |

---

## EPIC-10 · Onboarding & Access Control

> Waitlist, greeting, pause/resume.

| ID | Task | P | Estimate | Dependencies | Traceability | Labels |
|----|------|---|----------|--------------|--------------|--------|
| TASK-10.1 | Waitlist mechanism | P0 | 2 h | TASK-2.1, TASK-1.3 | FR-ONB.2 | `feature` |
| TASK-10.2 | New user greeting | P0 | 2 h | TASK-10.1 | FR-ONB.1 | `feature` |
| TASK-10.3 | Pause (/stop) | P0 | 2 h | TASK-2.1, TASK-1.3 | FR-PLT.5 | `feature` |
| TASK-10.4 | Resume (/start for paused) | P0 | 2 h | TASK-10.3 | FR-PLT.5 | `feature` |
| TASK-10.5 | /help command | P0 | 2 h | TASK-2.1 | 4.2 | `feature` |

---

## EPIC-11 · Admin & Monitoring

> Admin commands, alerts, health monitoring.

| ID | Task | P | Estimate | Dependencies | Traceability | Labels |
|----|------|---|----------|--------------|--------------|--------|
| TASK-11.1 | Admin commands in Telegram | P0 | 3 h | TASK-2.1, TASK-1.3, TASK-1.7 | NFR-SEC.4, 4.4 | `feature` |
| TASK-11.2 | Admin alerts | P0 | 3 h | TASK-11.1, TASK-5.2, TASK-4.5 | NFR-SEC.4, NFR-OBS.2 | `feature` |
| TASK-11.3 | Health check endpoint | P0 | 2 h | TASK-1.2, TASK-3.1 | NFR-OBS.2 | `infra` |
| TASK-11.4 | Sentry integration | P1 | 2 h | TASK-1.1, TASK-0.10 | NFR-OBS.2 | `infra` |
| TASK-11.5 | External monitoring (UptimeRobot) | P1 | 1 h | TASK-11.3 | NFR-OBS.2 | `infra` |
| TASK-11.6 | Retry failed messages (pg-boss) | P0 | 5 h | TASK-4.1, TASK-5.1, TASK-2.1 | NFR-REL.3 | `feature` |

---

## EPIC-12 · Evaluation & Quality

> Automated memory quality assessment.

| ID | Task | P | Estimate | Dependencies | Traceability | Labels |
|----|------|---|----------|--------------|--------------|--------|
| TASK-12.1 | LLM-as-judge: extraction accuracy | P1 | 4 h | TASK-5.5, TASK-3.1 | Goals 2.2 | `feature` |
| TASK-12.2 | LLM-as-judge: application relevance | P1 | 4 h | TASK-9.1, TASK-3.1 | Goals 2.2 | `feature` |
| TASK-12.3 | Synthetic test sets | P1 | 4 h | TASK-5.1 | 4.4 Evaluation | `chore` |
| TASK-12.4 | Metrics dashboard | P1 | 2 h | TASK-12.1, TASK-12.2 | Goals 2.2 | `chore` |

---

## EPIC-13 · Interest Detection

> Automatic interest detection from query patterns.

| ID | Task | P | Estimate | Dependencies | Traceability | Labels |
|----|------|---|----------|--------------|--------------|--------|
| TASK-13.1 | Interest detection job (pg-boss) | P1 | 5 h | TASK-1.3, TASK-3.1, TASK-3.3 | FR-MEM.15, 4.4 | `feature` |
| TASK-13.2 | Inline interest prompt | P1 | 4 h | TASK-13.1, TASK-9.1, TASK-4.4 | FR-MEM.15 | `feature` |
| TASK-13.3 | Interest detection trigger in pipeline | P1 | 2 h | TASK-13.1, TASK-4.1 | FR-MEM.15 | `feature` |
| TASK-13.4 | Promoted candidate check during generation | P1 | 5 h | TASK-13.1, TASK-9.1 | FR-MEM.15 | `feature` |

---

## Dependency Graph (top level)

```
EPIC-0 (Spikes P0)
    |
EPIC-1 (Setup) --> EPIC-3 (LLM) --> EPIC-4 (Pipeline Core)
    |                                    |
EPIC-2 (Gateway) -----------------> EPIC-5 (Extraction) --> EPIC-6 (Retrieval)
                                         |                     |
                                  EPIC-7 (Management)   EPIC-9 (Generation)
                                                               |
                                  EPIC-8 (Reminders)    EPIC-10 (Onboarding)
                                                               |
                                  EPIC-12 (Evaluation)  EPIC-11 (Admin)
                                                               |
                                                        EPIC-13 (Interests)
```

---

## Traceability to Artifacts

| Epic | FR / NFR | Artifacts |
|------|----------|-----------|
| 0 | All | 5.3 Tech Spikes |
| 1 | NFR-REL.1/2, NFR-OBS.1, NFR-COST.1 | 4.4 |
| 2 | FR-PLT.1, FR-PLT.6, NFR-PORT.2, NFR-PERF.5, NFR-REL.3 | 4.4 |
| 3 | NFR-PORT.1, NFR-COST.2, FR-PLT.4, NFR-SEC.2 | 4.4 |
| 4 | 4.1 IA, FR-PLT.4, NFR-SEC.2 | 4.1, 4.4 |
| 5 | FR-MEM.1–4, FR-MEM.12, FR-MEM.14 | 3.1, 4.1, 4.4 |
| 6 | FR-MEM.6, FR-MEM.8, FR-MEM.13, FR-MEM.14 | 3.1, 4.4 |
| 7 | FR-MEM.7–11, FR-PLT.3 | 3.1, 3.3 |
| 8 | FR-REM.1–7, FR-PLT.5 | 3.1, 4.4 |
| 9 | FR-COM.1–6 | 3.1, 4.2, 4.4 |
| 10 | FR-ONB.1–2, FR-PLT.5 | 3.1, 4.2 |
| 11 | NFR-SEC.4, NFR-OBS.1–2, NFR-REL.3 | 3.2, 4.4 |
| 12 | Goals 2.2 | 2.2, 4.3, 4.4 |
| 13 | FR-MEM.15 | 3.1, 4.4 |

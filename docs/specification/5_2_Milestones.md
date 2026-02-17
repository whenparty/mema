# 5.2 Milestones / Release Plan

## Purpose

MVP implementation plan broken down into functional milestones. Each milestone ends with working functionality that can be verified. Timelines are approximate and subject to revision after each milestone.

---

## Planning Parameters

| Parameter | Value |
|-----------|-------|
| Work cadence | ~40 h/week |
| Total backlog estimate | ~278 h |
| Uncertainty coefficient | ×1.5 (learning, debugging, unforeseen issues) |
| Realistic estimate | ~420 h (~10.5 weeks) |
| Implementation start | Week of February 24 (after Planning phase completion) |
| Target MVP launch | Early May 2026 |

**The ×1.5 coefficient** accounts for: learning new tools (Bun, Elysia, pg-boss, grammy), prompt iteration, debugging LLM integrations, unforeseen compatibility issues. To be revisited after Milestone 1.

---

## Milestone Overview

| # | Milestone | Tasks | Estimate | Duration | Outcome |
|---|-----------|-------|----------|----------|---------|
| M0 | Spikes & Foundation | 18 | 56 h | ~2 weeks | Risks mitigated, infrastructure ready |
| M1 | Walking Skeleton | 14 | 52 h | ~2 weeks | Bot responds in Telegram through pipeline |
| M2 | Memory Core | 13 | 54 h | ~2 weeks | Bot remembers and uses facts |
| M3 | Memory Management & Reminders | 13 | 46 h | ~2 weeks | Full memory lifecycle + reminders |
| M4 | Polish & Launch | 24 | 70 h | ~2.5 weeks | Evaluation, Interest Detection, hardening, launch |
| | **Total** | **82** | **278 h** | **~10.5 wk** | |

---

## M0 · Spikes & Foundation

> **Goal:** mitigate technical risks and prepare the foundation. No business logic — infrastructure only and confirmation of architectural decisions.

> **Target:** weeks 1–2 (February 24 – March 7)

### Composition

**Tech Spikes (P0 — gate-keepers):**

| Task | Estimate |
|------|----------|
| TASK-0.1 · Bun compatibility with dependencies | 4 h |
| TASK-0.2 · Drizzle + pgvector | 2 h |
| TASK-0.3 · Combined LLM extraction call | 8 h |
| TASK-0.11 · Webhook vs Long Polling | 2 h |

**Tech Spikes (P1 — in parallel with setup):**

| Task | Estimate |
|------|----------|
| TASK-0.6 · RRULE library for Bun | 2 h |
| TASK-0.7 · Per-user serialization | 2 h |
| TASK-0.8 · pg-boss scheduling precision | 2 h |

**Infrastructure:**

| Task | Estimate |
|------|----------|
| TASK-1.1 · Repository initialization | 3 h |
| TASK-1.2 · Docker Compose | 3 h |
| TASK-1.3 · DB schema (Drizzle migrations) | 4 h |
| TASK-1.4 · CI/CD (GitHub Actions) | 3 h |
| TASK-1.5 · Database backup | 3 h |
| TASK-1.6 · Logging (pino) | 2 h |
| TASK-1.7 · Environment configuration | 2 h |

**Remaining P1/P2 spikes:**

| Task | Estimate |
|------|----------|
| TASK-0.4 · Multi-model generation | 4 h |
| TASK-0.5 · Semantic search in Russian | 4 h |
| TASK-0.9 · LLM-generated RRULE | 4 h |
| TASK-0.10 · Sentry + Bun | 2 h |

### Work Order

```
Week 1:
  Mon-Tue: TASK-0.1 (Bun compat) + TASK-0.2 (Drizzle pgvector)
     → Gate: if Bun doesn't work — decision to migrate to Node.js
  Wed:     TASK-0.11 (Webhook vs Polling) + TASK-0.7 (Per-user lock)
  Thu-Fri: TASK-1.1 (repo) + TASK-1.2 (Docker) + TASK-1.7 (config)

Week 2:
  Mon-Tue: TASK-0.3 (Combined extraction call) — most labor-intensive spike
  Wed:     TASK-1.3 (DB schema) + TASK-0.6 (RRULE) + TASK-0.8 (pg-boss)
  Thu:     TASK-1.4 (CI/CD) + TASK-1.5 (backup) + TASK-1.6 (logging)
  Fri:     TASK-0.4 (Multi-model) + TASK-0.5 (Semantic search RU)
          TASK-0.9 (LLM RRULE) + TASK-0.10 (Sentry)
```

### Definition of Done

- [ ] All P0 spikes completed, decisions documented
- [ ] `docker compose up` brings up app + PostgreSQL with pgvector
- [ ] Drizzle migrations pass, all 12 tables created
- [ ] CI/CD: push to main → build → test → deploy to VPS
- [ ] Daily PostgreSQL backup → Backblaze B2
- [ ] Document with spike results (decisions, workarounds, final prompts)

### Gate: Pipeline Architecture Decision

Based on TASK-0.3 results, finalize:
- Combined call or separate calls?
- Final structured output schema
- Number of LLM calls per message (trivial / standard)

This decision affects all EPIC-4 and EPIC-5 tasks. If the combined call doesn't meet quality standards — adjust backlog estimates.

---

## M1 · Walking Skeleton

> **Goal:** end-to-end pipeline. Bot receives a message in Telegram → classifies intent → generates response → sends it. No memory, but the entire "pipe" works.

> **Target:** weeks 3–4 (March 10 – March 21)

### Why Walking Skeleton

Before building memory — a working skeleton is needed that any message passes through. This enables:
- Discovering integration issues (Telegram ↔ Pipeline ↔ LLM) before adding complex logic
- Getting the first deployable artifact within 2 weeks
- Iterating quickly: adding features to a working bot rather than assembling everything at once

### Composition

**Telegram Gateway:**

| Task | Estimate |
|------|----------|
| TASK-2.1 · Basic Telegram Gateway | 3 h |
| TASK-2.2 · Per-user serialization | 3 h |
| TASK-2.4 · Idempotent processing | 4 h |

**LLM Abstraction:**

| Task | Estimate |
|------|----------|
| TASK-3.1 · LLMProvider interface | 4 h |
| TASK-3.2 · Token counting and usage tracking | 3 h |
| TASK-3.3 · Prompts: storage and loading | 3 h |
| TASK-3.4 · Embedding service | 4 h |

**Pipeline Core:**

| Task | Estimate |
|------|----------|
| TASK-4.1 · Pipeline orchestrator | 4 h |
| TASK-4.2 · Intent and complexity classification | 4 h |
| TASK-4.3 · Routing to handlers | 3 h |
| TASK-4.4 · Dialog State Manager | 4 h |
| TASK-4.5 · Rate limiting | 2 h |
| TASK-4.6 · Token quota check | 3 h |

**Basic generation:**

| Task | Estimate |
|------|----------|
| TASK-9.1 · Basic response generation (single model) | 4 h |

**Onboarding (minimal):**

| Task | Estimate |
|------|----------|
| TASK-10.5 · /help | 2 h |

### Definition of Done

- [ ] Bot deployed on VPS, accessible in Telegram
- [ ] User message → pipeline → intent classification → response
- [ ] /start, /help, /stop work
- [ ] Rate limiting: >100 msg/hour → warning
- [ ] Token quota: checked, on exceeding → blocking
- [ ] Dialog State: intermediate states work (CONFIRM, AWAIT, reset)
- [ ] Typing indicator sent during processing
- [ ] Response generated by a single powerful model (without multi-model generation)

### Demo Scenario

```
User: Hi!
Bot: Hi! How can I help?

User: Explain quantum computing
Bot: [response based on general knowledge]

User: /help
Bot: [brief help message]
```

The bot responds but doesn't remember anything yet. That's expected — memory is added in M2.

---

## M2 · Memory Core

> **Goal:** the bot remembers facts from conversation and uses them in responses. The "aha" moment — the bot demonstrates memory for the first time.

> **Target:** weeks 5–6 (March 24 – April 4)

### Composition

**Memory Extraction (pipeline steps 4–7):**

| Task | Estimate |
|------|----------|
| TASK-5.1 · Fact extraction | 6 h |
| TASK-5.2 · Injection detector | 3 h |
| TASK-5.3 · Entity resolution and creation | 5 h |
| TASK-5.4 · Conflict detection | 5 h |
| TASK-5.5 · Fact persistence | 3 h |
| TASK-5.7 · User Summary rebuild trigger | 2 h |

**Memory Retrieval & Application:**

| Task | Estimate |
|------|----------|
| TASK-6.1 · Semantic search over facts | 4 h |
| TASK-6.2 · Short-term context | 4 h |
| TASK-6.3 · Tiered Memory context assembly | 3 h |
| TASK-6.4 · User Summary rebuild (pg-boss) | 5 h |
| TASK-6.6 · Memory explain handler | 2 h |

**Multi-model generation:**

| Task | Estimate |
|------|----------|
| TASK-9.2 · Multi-model generation | 5 h |
| TASK-9.3 · Web search | 4 h |

### Definition of Done

- [ ] Facts are extracted from messages automatically and silently
- [ ] Entities are resolved: "Mike" and "Mikey" = the same person
- [ ] Conflicts are handled: explicit update / implicit contradiction / coexistence
- [ ] Semantic search returns relevant facts
- [ ] User Summary is rebuilt automatically
- [ ] Responses are personalized: "Where to eat sushi?" → recommendations for the city from memory
- [ ] memory.explain: "How do you know that?" → source_quote
- [ ] Multi-model generation: two providers in parallel + validator
- [ ] Web search works via LLM tool calling
- [ ] Injection detector blocks prompt injection attempts in facts

### Demo Scenario

```
User: We moved to Munich in January.
Bot: Oh, Munich is a great city! How are you settling in?

[3 days later]

User: Where to eat sushi?
Bot: In Munich, people recommend Sushi Sano and Matsuhisa. Want more details?

User: How do you know I'm in Munich?
Bot: You said: "We moved to Munich in January" (March 15).
```

**This is the key milestone.** If the demo scenario works — the product core is ready.

---

## M3 · Memory Management & Reminders

> **Goal:** the user has full control over memory + reminders work. The product is functionally complete for MVP.

> **Target:** weeks 7–8 (April 7 – April 18)

### Composition

**Memory Management:**

| Task | Estimate |
|------|----------|
| TASK-7.1 · Memory viewing | 3 h |
| TASK-7.3 · Fact editing | 3 h |
| TASK-7.4 · Fact deletion | 3 h |
| TASK-7.5 · Cascading entity deletion | 4 h |
| TASK-7.6 · Account deletion | 3 h |

**Reminders:**

| Task | Estimate |
|------|----------|
| TASK-8.1 · Timezone detection | 3 h |
| TASK-8.2 · One-time reminders | 4 h |
| TASK-8.3 · Recurring reminders | 5 h |
| TASK-8.4 · Memory-based reminders | 3 h |
| TASK-8.5 · Reminder delivery | 5 h |
| TASK-8.6 · Reminder management | 4 h |

**Onboarding (full):**

| Task | Estimate |
|------|----------|
| TASK-10.1 · Waitlist | 2 h |
| TASK-10.2 · Greeting | 2 h |

### Definition of Done

- [ ] "What do you know about me?" → structured summary
- [ ] "Forget that I live in Berlin" → confirmation → deletion
- [ ] "Forget everything about Dima" → cascading deletion with separation
- [ ] "Delete all my data" → full account deletion
- [ ] "Remind me tomorrow at 9 about the meeting" → reminder arrives within ±1 min
- [ ] "Remind me every Monday at 10:00" → recurring with RRULE
- [ ] "Remind me 3 days before Dima's birthday" → date from memory
- [ ] Timezone detected from the city in memory
- [ ] Waitlist works: new user → queue → admin approval
- [ ] Pause / resume: /stop, /start

### Demo Scenario

```
User: Remember that Dima's birthday is March 15.
Bot: Got it ✅ Want me to remind you closer to the date?

User: Yes, 3 days before.
Bot: Done 📅 March 12 — congratulate Dima.

[March 12]

Bot: Congratulate Dima 🎂 He's turning 35, lives in Berlin. Want me to compose a birthday message?

User: What do you know about me?
Bot: You live in Munich, work at Yandex. Your son is 4 years old...

User: Forget everything about Dima.
Bot: About Dima: lives in Berlin, birthday March 15... Delete?

User: Yes
Bot: Done ✅
```

**After this milestone, the MVP is functionally complete.** All MUST requirements from FR are covered.

---

## M4 · Polish & Launch

> **Goal:** quality, observability, edge cases, launch with waitlist users.

> **Target:** weeks 9–11 (April 21 – May 9)

### Composition

**Admin & Monitoring:**

| Task | Estimate |
|------|----------|
| TASK-11.1 · Admin commands | 3 h |
| TASK-11.2 · Admin alerts | 3 h |
| TASK-11.3 · Health check endpoint | 2 h |
| TASK-11.4 · Sentry integration | 2 h |
| TASK-11.5 · External monitoring | 1 h |
| TASK-11.6 · Retry failed messages | 5 h |

**Evaluation & Quality:**

| Task | Estimate |
|------|----------|
| TASK-12.1 · LLM-as-judge: extraction accuracy | 4 h |
| TASK-12.2 · LLM-as-judge: application relevance | 4 h |
| TASK-12.3 · Synthetic test sets | 4 h |
| TASK-12.4 · Metrics dashboard | 2 h |

**Interest Detection:**

| Task | Estimate |
|------|----------|
| TASK-13.1 · Interest detection job | 5 h |
| TASK-13.2 · Inline interest prompt | 4 h |
| TASK-13.3 · Pipeline trigger | 2 h |
| TASK-13.4 · Promoted candidate check | 5 h |

**Deferred P1 tasks:**

| Task | Estimate |
|------|----------|
| TASK-2.3 · Typing indicator and interim messages | 2 h |
| TASK-5.6 · Fact enrichment (soft ask) | 3 h |
| TASK-6.5 · Freshness check (temporal_sensitivity) | 3 h |
| TASK-7.2 · Fact change history | 2 h |
| TASK-8.7 · Timezone update on relocation | 4 h |
| TASK-9.4 · Advisory Guardrails prompt | 3 h |
| TASK-9.5 · Contextual suggestion rule | 4 h |
| TASK-10.3 · Pause (/stop) | 2 h |
| TASK-10.4 · Resume (/start for paused) | 2 h |

### Definition of Done

- [ ] Admin commands: approve, block, unblock, stats
- [ ] Alerts: injection, rate limit, quota, crashes → Telegram to admin
- [ ] Health check + UptimeRobot monitoring
- [ ] Sentry catches runtime errors
- [ ] Failed messages: retry with fact extraction + notification
- [ ] Evaluation: extraction accuracy and application relevance are measured
- [ ] Synthetic test sets: ≥ 30 cases, regression on prompt changes
- [ ] Interest detection: automatic discovery + inline prompt
- [ ] All P1 tasks from previous milestones closed
- [ ] Smoke test: full user scenario from /start to account deletion
- [ ] Waitlist: first 5–10 users invited

### Launch Checklist

- [ ] VPS running stably for ≥ 3 days without restart
- [ ] Backup tested: restore from Backblaze B2
- [ ] Monitoring active: UptimeRobot + Sentry + admin alerts
- [ ] All MUST requirements from FR covered
- [ ] Evaluation baseline: extraction accuracy ≥ 85%, application relevance ≥ 80%
- [ ] Prompts finalized and tested
- [ ] README updated with deployment instructions
- [ ] Waitlist users invited and approved

---

## Visual Timeline

```
February                 March                       April                    May
   24    3    10    17    24    31    7    14    21    28    5
   |-----|-----|-----|-----|-----|-----|-----|-----|-----|-----|
   ├─ M0 ─┤                                               
          ├── M1 ──┤                                       
                   ├── M2 ──┤                              
                            ├── M3 ──┤                     
                                     ├──── M4 ────┤        
                                                  ↑
                                              MVP Launch
```

---

## Plan Management Principles

### Review After Each Milestone

After each milestone — a retrospective:
- Actual time vs estimate. If the variance is > 50% — revise estimates for subsequent milestones.
- Which tasks turned out harder/easier than expected.
- Whether P1 tasks from M4 should be moved to earlier milestones (or vice versa).

### Critical Path

```
TASK-0.1 → TASK-1.1 → TASK-1.3 → TASK-3.1 → TASK-5.1 → TASK-6.1 → TASK-9.1
  (Bun)     (repo)     (DB)       (LLM)      (extract)  (search)   (response)
```

This is the dependency chain that determines the minimum time to the first working memory-powered response. Any delay on this path shifts everything.

### What Can Be Cut If Behind Schedule

**Level 1 — without losing MVP value:**
- EPIC-13 (Interest Detection) entirely → saves ~16 h
- TASK-12.1–12.4 (Evaluation) → saves ~14 h
- TASK-7.2 (change history) → saves ~2 h

**Level 2 — feature simplification:**
- TASK-9.2 → single-model generation instead of multi-model → saves ~5 h
- TASK-8.3 → one-time reminders only, no recurring → saves ~5 h
- TASK-5.4 → simplified conflicts (explicit updates only) → saves ~3 h

**Level 3 — minimal launch:**
- Remove reminders entirely (EPIC-8) → saves ~28 h
- This is drastic, but allows launching a clean memory-first product in ~6 weeks

### Buffers

Each milestone has an implicit buffer (~30% of estimate) due to the ×1.5 coefficient. If a milestone finishes early — remaining time goes to P1 tasks from M4 or technical debt.

---

## Traceability to Backlog

| Milestone | Epics | Tasks |
|-----------|-------|-------|
| M0 | EPIC-0, EPIC-1 | TASK-0.*, TASK-1.* |
| M1 | EPIC-2, EPIC-3, EPIC-4 (partial), EPIC-9 (TASK-9.1), EPIC-10 (TASK-10.5) | TASK-2.*, TASK-3.*, TASK-4.*, TASK-9.1, TASK-10.5 |
| M2 | EPIC-5, EPIC-6, EPIC-9 (TASK-9.2, 9.3) | TASK-5.*, TASK-6.*, TASK-9.2, TASK-9.3 |
| M3 | EPIC-7, EPIC-8, EPIC-10 (TASK-10.1–10.4) | TASK-7.*, TASK-8.*, TASK-10.1–10.4 |
| M4 | EPIC-11, EPIC-12, EPIC-13, remaining P1 | TASK-11.*, TASK-12.*, TASK-13.*, P1 from M1–M3 |

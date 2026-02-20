# 4.1 Information Architecture

## Conventions

- The architecture describes message routing in a Telegram bot conversational interface.
- Analogous to navigation in a GUI application — intent classification (user intentions) and routing to handlers.
- Traceability to FR / US is provided for each intent.

---

## Message Processing Principle

> **The canonical pipeline description with full numbering (12 steps) is in 4.4 System Architecture.** Below is the pipeline business logic without its own numbering.

Every incoming message passes through a sequential pipeline:

- **Fact extraction** — analyzing the message for significant facts (FR-MEM.1). Includes determining `temporal_sensitivity` (`permanent`, `long_term`, `short_term`).
- **Entity resolution and creation** — linking to existing or creating new entities in memory (FR-MEM.3).
- **Conflict detection** — searching for contradictions with existing facts of the same type (FR-MEM.4). Distinguishes between explicit updates, implicit contradictions, and coexistence (see "Conflict Handling" section).
- **Fact storage** — if there are no blocking clarifications.
- **Intent and complexity classification** — determining the user's intention, routing to a handler, and assessing request complexity (`trivial` / `standard`) to select the generation strategy (FR-COM.5).
- **Context formation (Tiered Memory)** — three-tier context: User Summary (always in prompt, FR-MEM.14), pgvector search for relevant facts (Stage 1, FR-MEM.6a; Stage 2 — post-MVP), short-term context from message history.
- **Response generation** — incorporating both new and existing context. For standard requests: parallel generation by two powerful models + validation and synthesis by a compact model. For trivial: a single powerful model.

The order is critical: fact extraction and storage occur **before** response generation. This ensures the response reflects the current context (e.g., recommending a restaurant in Munich rather than Berlin if the user just reported a move).

---

## Entry Points

| Entry Point | Type | Purpose | Route |
|-------------|------|---------|-------|
| `/start` | Telegram command | Bot launch, onboarding, resume after pause | → Onboarding (waitlist / greeting / resume) |
| `/help` | Telegram command | Brief capability summary | → Static message |
| `/stop` | Telegram command | Pause: bot stops processing messages, data is preserved | → Pause confirmation |
| Text message | Free text | Primary interaction | → Intent classification |

Telegram commands are processed directly, without intent classification. Free text goes through the classifier.

---

## Intent Taxonomy

### Level 1 · Categories

| Category | Description |
|----------|-------------|
| `memory` | Memory operations: viewing, editing, deletion |
| `reminder` | Creating and managing reminders |
| `chat` | Everything else: questions, remarks, discussions — the pipeline decides whether memory is needed |
| `system` | Account management and meta-information |

### Level 2 · Intents

#### memory — Memory Operations

| Intent | Description | Example Messages | FR | US |
|--------|-------------|------------------|----|----|
| `memory.save` | Explicit request to remember a fact. Unlike background extraction: the bot confirms storage | "Remember that Dima's birthday is March 15," "Save: my son has a peanut allergy," "Note that I owe Misha 5000" | FR-MEM.1, FR-MEM.2 | US-MEM.11 |
| `memory.view` | View saved facts (general or filtered). Includes viewing change history for a specific fact (FR-MEM.2a, SHOULD) — if the request implies history, the handler shows the version chain via `previous_version_id` | "What do you know about me?", "What do you remember about my job?", "What did I tell you in January?", "How has my job information changed?" | FR-MEM.7, FR-MEM.8, FR-MEM.2a | US-MEM.6, US-MEM.7, US-MEM.12 |
| `memory.edit` | Explicit fact correction | "I no longer work at Google," "Fix it: my son is not 3, he's 4" | FR-MEM.9 | US-MEM.8 |
| `memory.delete` | Deleting a specific fact | "Forget that I live in Berlin," "Delete my salary information" | FR-MEM.10 | US-MEM.9 |
| `memory.delete_entity` | Deleting all facts about an entity | "Forget everything about Dima," "Delete everything you know about Marina" | FR-MEM.11 | US-MEM.10 |
| `memory.explain` | Explaining the source of facts used in the last response | "How do you know that?", "Why did you decide that?", "Based on what?" | FR-MEM.13 | US-MEM.13 |

#### reminder — Reminders

| Intent | Description | Example Messages | FR | US |
|--------|-------------|------------------|----|----|
| `reminder.create` | Creating a one-time or recurring reminder | "Remind me tomorrow at 9 about the meeting," "Remind me every Monday at 10:00," "Remind me 3 days before Dima's birthday" | FR-REM.1, FR-REM.2, FR-REM.7 | US-REM.1, US-REM.2, US-REM.5 |
| `reminder.list` | Viewing active reminders | "What reminders do I have?", "What did I ask you to remind me about?" | FR-REM.4 | US-REM.4 |
| `reminder.cancel` | Canceling a reminder | "Cancel the report reminder," "Remove the Monday reminder" | FR-REM.4 | US-REM.4 |
| `reminder.edit` | Changing the time or text of a reminder | "Move the doctor reminder to Wednesday," "Change the reminder — not at 9, but at 10" | FR-REM.4 | US-REM.4 |

#### chat — Conversation

| Intent | Description | Example Messages | FR | US |
|--------|-------------|------------------|----|----|
| `chat` | Any message that is not an explicit memory operation, reminder, or system command. The bot responds; the pipeline determines whether memory is needed | "Where to eat sushi?", "Explain quantum computing," "My son started kindergarten in September," "Thanks for the advice," "What's the weather?" | FR-COM.1, FR-COM.2, FR-COM.4, FR-COM.5 | US-COM.1, US-COM.2, US-COM.3 |

Separating "question with memory" and "question without memory" is not needed at the intent classification level. The pipeline always searches for relevant facts in memory; if found — applies them, if not — responds without them. This is a pipeline decision, not a classifier decision.

#### system — System

| Intent | Description | Example Messages | FR | US |
|--------|-------------|------------------|----|----|
| `system.delete_account` | Request for complete data deletion | "Delete all my data," "I want to delete my account" | FR-PLT.3 | US-PLT.1 |
| `system.pause` | Pause — bot stops processing, data is preserved | `/stop` command | FR-PLT.5 | US-PLT.3 |
| `system.resume` | Resume operation after pause | `/start` command (for a paused user) | FR-PLT.5 | US-PLT.3 |

---

## Conflict Handling

When a contradiction is detected between a new and an existing fact, the bot distinguishes three outcomes:

**Explicit update** — the user themselves reports a change ("moved," "changed jobs," "no longer vegetarian"). The bot silently updates the fact: old → outdated, new → active. No clarification needed. The response reflects the new context.

**Implicit contradiction** — the new fact conflicts with the old one, but the user doesn't declare a change. The bot transitions to CONFIRM state (type: conflict) and asks for clarification.

**Coexistence** — both facts can be simultaneously valid. The bot saves both as active, does not transition to CONFIRM. If necessary, updates content with qualifiers to distinguish them.

| Situation | Example | Type | Action |
|-----------|---------|------|--------|
| User explicitly reports a change | "I moved to Munich" (memory has Berlin) | Explicit update | Silently update the fact |
| User mentions a new value without change context | "I'm in Munich now, working on a project here" (memory has Berlin) | Implicit contradiction | Clarify: "Did you move from Berlin or are you on a business trip?" |
| User reports a supplement, not a replacement | "I also work as a consultant" (memory has Google) | No conflict | Save both facts |
| Both facts can be simultaneously valid (parallel roles, evolving opinions) | "Google is my main job, Yandex is a side gig" or "I think maybe I should go back, it's lonely here" | Coexistence | Save both as active, qualify if necessary |
| Different type of fact, no contradiction | "I'm looking at apartments in Munich" (memory has lives in Berlin) | No conflict | Save as a new fact |

## Handling Intent Ambiguity

A message may be difficult to classify unambiguously. Prioritization rules:

| Situation | Rule | Example |
|-----------|------|---------|
| Fact + question in one message | Intent: `chat`, pipeline extracts the fact and uses it for response generation | "I moved to Munich, recommend a restaurant" → relocation fact extracted and saved, restaurant recommended for Munich |
| Unclear: edit or new fact | Processed as `chat` → memory pipeline detects conflict (FR-MEM.4) | "I work at Yandex" (with saved "Google") → pipeline: conflict → clarification |
| Unclear: deletion or edit | Classified by the presence of an explicit deletion indicator | "Forget that I live in Berlin" → `memory.delete`; "I no longer live in Berlin" → `memory.edit` |
| Multiple matches when managing | Bot shows a numbered list and transitions to AWAIT (type: missing_data) | "Cancel the report reminder" with 3 matches → numbered list |
| Intent not recognized | Processed as `chat` | Any message that doesn't fall into other categories |

---

## Dialog State Diagram

The bot is in one of the states at any given moment. Most messages are processed in the `idle` state — the bot classifies the intent and responds in one step. Multi-step scenarios transition the bot to an intermediate state where it awaits a specific response.

Intermediate states are divided into two types: `CONFIRM` (bot awaits a decision) and `AWAIT` (bot awaits data). Specific behavior is determined by the `context.type` field in DialogState.

```
┌─────────────────────────────────────────────────────────────────────┐
│                          IDLE                                       │
│                  (primary state)                                    │
│                                                                     │
│  Pipeline: fact extraction → intent classification →                │
│  routing → response                                                 │
│  Background tasks (pg-boss): User Summary rebuild,                  │
│  Interest Detection                                                 │
└──────────────────┬──────────────────┬───────────────────────────────┘
                   │                  │
                   ▼                  ▼
          ┌────────────────┐  ┌────────────────┐
          │    CONFIRM     │  │     AWAIT      │
          │ (awaits decis.)│  │ (awaits data)  │
          │                │  │                │
          │  context.type: │  │  context.type: │
          │  · conflict    │  │  · missing_data│
          │  · delete      │  │  · entity_dis- │
          │  · acct_delete │  │    ambiguation │
          │  · interest    │  │                │
          └───────┬────────┘  └───────┬────────┘
                  │                   │
                  ▼                   ▼
            User response      Data from user
              → IDLE               → IDLE
```

### State Descriptions

| State | context.type | Entry Trigger | Expected Response | Return to IDLE |
|-------|-------------|---------------|-------------------|----------------|
| `IDLE` | — | Default | Any message → intent classification | — |
| `CONFIRM` | `conflict` | Memory pipeline detected an implicit contradiction with an existing fact (FR-MEM.4) | Change confirmation / denial / clarification | Update or save both facts |
| `CONFIRM` | `delete` | Intent `memory.delete` or `memory.delete_entity` (FR-MEM.10, FR-MEM.11) | Deletion confirmation / cancel | Deletion or cancel |
| `CONFIRM` | `account_delete` | Intent `system.delete_account` (FR-PLT.3) | Irreversible deletion confirmation / cancel | Full deletion or cancel |
| `CONFIRM` | `interest` | Interest detection found a promoted candidate for the current topic (FR-MEM.15) | Confirmation / rejection | Create Fact with `preference` or dismiss candidate |
| `AWAIT` | `missing_data` | Data for the request is missing — city, date, etc. (FR-REM.6, FR-REM.7, FR-COM.4). Includes timezone determination fallback: if city is unknown during first reminder creation — bot asks for city | Missing information | Continue original scenario |
| `AWAIT` | `entity_disambiguation` | Compact model returned `entity_confidence: low` during entity resolution (FR-MEM.3) | Clarification: "is this your son or your neighbor Andrew?" | Save the fact with the specified entity and respond to the original request |

### Intermediate State Reset

An intermediate state resets to `IDLE` in two cases:

1. **Session timeout (30 minutes without messages).** The state is automatically canceled. The bot sends a short notification to the user about the lost context.
2. **New off-topic message.** If the user sends a message with a different intent instead of responding to a clarification, the intermediate state resets (= cancel), and the new message is processed normally.

On reset:

- `CONFIRM` — unfinished confirmations are canceled. The fact is not updated / deleted / saved. Interest candidate remains in `promoted` status for next time.
- `AWAIT` — unfinished scenario is canceled. The bot does not create a reminder "blindly." For `entity_disambiguation`: the fact is dropped, and the bot notifies the user: *"By the way, I didn't save [X] — didn't get your answer."*

**Handling "bare" confirmations in IDLE:** when short messages ("yes," "no," "ok") are received in IDLE state, the system checks for a recently reset intermediate state (~5 minutes). If found — the bot responds in the context of the reset state, helping the user continue the interrupted scenario.

Principle: background processes (fact extraction, interest detection) always complete; intermediate states (clarifications) — are canceled on topic change or timeout.

---

## Reminder Behavior During Pause (FR-PLT.5)

When a user is paused, reminders are not delivered and are skipped permanently. One-time reminders are marked as `delivered`, recurring ones recalculate `next_trigger_at` for the next trigger. On resume (`/start`), missed reminders are not delivered.

Delayed delivery with a note is only provided during a system failure (NFR-REL.4), when the user was active but the bot was unavailable.

---

## Routing: From Message to Response

> Step numbering corresponds to the canonical pipeline from 4.4 System Architecture.

```
Incoming message
        │
        ├──── Telegram command? (/start, /help, /stop)
        │     Yes → Direct processing (no classification)
        │
        ├──── Bot in intermediate state? (not IDLE)
        │     Yes → Process response in the context of the current state
        │
        └──── IDLE → Sequential pipeline (see 4.4):
                     │
                     ├── [4] Extract facts from message + injection detector
                     ├── [5] Entity resolution and creation (FR-MEM.3)
                     ├── [6] Conflict detection (FR-MEM.4)
                     │       ├── Explicit update → silently update
                     │       ├── Implicit contradiction → CONFIRM (type: conflict)
                     │       └── Coexistence → save both as active
                     ├── [7] Save facts
                     ├── [8] Intent + complexity classification → routing
                     ├── [10] Context formation (Tiered Memory, FR-MEM.14):
                     │       ├── Tier 1: User.summary (always, if not null)
                     │       ├── Tier 2: pgvector search (Stage 1)
                     │       │     └── Stage 2 (LLM-driven deep retrieval) — post-MVP
                     │       └── Tier 3: last 5 message pairs +
                     │                  semantically relevant pairs
                     └── [11] Response generation:
                             ├── trivial → one powerful model
                             ├── standard → two powerful models in parallel
                             │             → validator synthesizes final response
                             └── Check promoted interests (FR-MEM.15):
                                  if match with current topic
                                  → add inline question → CONFIRM (type: interest)
```

---

## Traceability to Scope

| Scope (2.3) | Intents / Entry Points |
|---|---|
| Automatic fact extraction | Pipeline steps 4–7 (synchronous, all messages) |
| Memory application in responses | `chat` (pipeline determines memory relevance) |
| User context summary | Tier 1 in pipeline step 10 (FR-MEM.14) |
| Memory viewing | `memory.view` |
| Fact editing and deletion | `memory.edit`, `memory.delete`, `memory.delete_entity` |
| Interest detection | Background process (pg-boss job) + CONFIRM with `context.type: interest` |
| Knowledge source explanation | `memory.explain` |
| One-time / recurring reminders | `reminder.create` |
| Reminder management | `reminder.list`, `reminder.cancel`, `reminder.edit` |
| Contextual responses | `chat` (multi-model generation for standard requests) |
| Multilingual support | All intents (provided by LLM) |
| Telegram bot | `/start`, `/help`, `/stop` + free text |
| Waitlist | `/start` → status check |
| Account deletion | `system.delete_account` (deletion via dialog) |
| Pause and resume | `system.pause` (`/stop`), `system.resume` (`/start`) |

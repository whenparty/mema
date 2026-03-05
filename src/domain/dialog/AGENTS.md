# Dialog State Module

## Purpose

Domain logic for dialog state management — tracks intermediate conversation states
(CONFIRM/AWAIT), evaluates inbound messages for timeout/off-topic reset, handles
bare-confirmation recovery from recent resets, and exposes a pure decision API
consumed by the pipeline. Implements FR-PLT dialog state requirements from spec 4_1.

## Key Files

- `types.ts` — Dialog states, discriminated context union (6 subtypes), decision outputs, reset reasons, persistence port interface (`DialogStateStore`), context validation/parsing, intent family helpers, bare confirmation matching
- `state-manager.ts` — `createDialogStateManager()` factory: evaluates inbound messages against persisted state, produces typed decisions (continue/reset/idle/recover), manages in-memory recent-reset TTL cache

## Interfaces

- `DialogState` — `"idle" | "confirm" | "await"`
- `DialogContext` — Discriminated union: `ConflictContext | DeleteContext | AccountDeleteContext | InterestContext | MissingDataContext | EntityDisambiguationContext`
- `DialogDecision` — `ContinueDialogDecision | ResetTimeoutDecision | ResetOffTopicDecision | IdleNoopDecision | RecoverRecentResetDecision`
- `DialogStateStore` — Persistence port: `load(userId)`, `upsert(userId, state, context, expiresAt)`, `resetToIdle(userId)`
- `DialogStateManager` — `evaluateInbound(userId, intent, messageText, now?)`, `transitionTo(userId, state, context, timeoutMs?)`, `resetToIdle(userId, reason)`
- `DialogStateRecord` — Persisted state shape with userId, state, context, createdAt, expiresAt
- `RecentResetEntry` — In-memory cache entry with context, reason, resetAt timestamp
- `parseDialogContext(raw)` — Validates unknown JSON into typed `DialogContext` or null
- `isValidStateContextPairing(state, context)` — Validates state/context family consistency
- `isBareConfirmation(text)` — Pattern match for short confirmation messages
- `isNewIntentFamily(intent)` — Checks if intent belongs to memory/reminder/system family
- `isContinuationIntent(intent)` — Checks if intent is `chat` (continuation in non-idle)

## Patterns & Decisions

- Pure domain — no infra imports; persistence via injected `DialogStateStore` port
- Discriminated union on `context.type` with strict runtime validation at boundary
- Lazy timeout: checked on inbound message, not via background scheduler
- Off-topic policy: `chat` intent = continuation in non-idle; `memory.*`/`reminder.*`/`system.*` = off-topic reset
- Classifier failure safety: undefined intent in non-idle = continuation (not auto-reset)
- Bare confirmation recovery: in-memory Map with 5-minute TTL, written on every reset, read on short IDLE messages
- Invalid/malformed persisted context resets to idle safely (no crash)
- Decision outputs are exhaustive typed union — pipeline switch covers all cases

## Dependencies

- imports from: `@/shared/types` (Intent)
- imported by: `@/pipeline/steps/evaluate-dialog-state.ts`, `@/infra/db/queries/dialog-states.ts` (implements port)

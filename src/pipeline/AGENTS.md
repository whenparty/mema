# Pipeline

## Purpose

Sequential message processing pipeline for inbound text messages. The product architecture still has 12 numbered steps plus sub-step 2a, but the runtime now has 14 injected step slots because `dialog_state_gate` runs as an internal pre-IDLE gate after `save_message_received` and before idle-only work. The pipeline receives a platform-agnostic `MessageInput`, executes steps in canonical runtime order, and returns a response string. Steps are pluggable functions injected at construction time (dependency injection). Implements the core processing flow from spec `4_4_System_Architecture.md`.

## Key Files

- `types.ts` -- Pipeline type definitions: `PipelineStepName`, `PipelineStep`, `PipelineSteps`, `PipelineContext`, `STEP_ORDER`, route handler types
- `orchestrator.ts` -- `createPipeline()` factory that returns an `(input: MessageInput) => Promise<string>` function
- `router.ts` -- `resolveRoute()` pure function mapping intents to route keys; `createRouteStep()` factory for the route_intent slot
- `dialog-state-types.ts` -- Dialog-state runtime contracts: subtype ids, persisted context minimums, handler results, manager/store ports, scheduler refs
- `dialog-state-handlers.ts` -- `createDialogStateHandlers()` factory: six-subtype registry with local continuation matching, parseContext validation, and recent-reset hint derivation
- `dialog-state-manager.ts` -- `createDialogStateManager()` factory: owns active-state lookup, completion ordering, timeout reconciliation, off-topic reset, recent-reset recovery, and `openState()` for future producer tasks
- `dialog-state-timeout-scheduler.ts` -- `createDialogStateTimeoutScheduler()` factory: process-local timeout scheduling keyed by internal `userId`
- `steps/dialog-state-gate.ts` -- `createDialogStateGateStep()` factory for the internal pre-IDLE gate slot
- `steps/stubs.ts` -- `createStubSteps()` and `createStubRouteHandlers()` for testing and initial wiring

## Interfaces

- `PipelineSteps` -- exported from `types.ts`, defines all 14 runtime step slots; consumed by `createPipeline()`
- `PipelineContext` -- mutable accumulator passed through all steps; exported from `types.ts`
- `RouteHandlers` -- exported from `types.ts`; maps `RouteHandlerKey` to handler functions
- `MessageInput` -- imported from `@/shared/types`; platform-agnostic message representation
- `DialogStateManager` -- exported from `dialog-state-types.ts`; owns `openState()`, inbound active-state evaluation, and timeout handling
- `DialogStateHandlerRegistry` -- exported from `dialog-state-types.ts`; six-subtype registry used by the manager
- `DialogStateStorePort` -- exported from `dialog-state-types.ts`; pipeline-owned structural port satisfied by the infra store

## Patterns and Decisions

- **Step execution**: Steps run sequentially in `STEP_ORDER`. Each step receives `(ctx, log)`.
- **dialog_state_gate**: Internal runtime slot after `save_message_received`. It checks active dialog state, handles timeout reconciliation and recent-reset recovery, and may short-circuit via `ctx.earlyResponse` before idle-only steps run.
- **Early exit**: Any step can set `ctx.earlyResponse` to skip remaining steps (except `update_processing_status`).
- **Error handling**: Main loop is wrapped in try/catch. On error, `ctx.error` is set, `update_processing_status` runs in a nested try/catch, and `FALLBACK_RESPONSE` is returned.
- **Logging**: Metadata only (userId, messageId, step name, duration). Never log full message text (NFR-OBS.1).
- **Step timing**: Each step's duration (ms) is recorded in `ctx.stepTimings`.
- **update_processing_status always runs**: It is excluded from the main loop and invoked separately after both success and failure paths.
- **Dialog-state completion seam**: Handlers parse and match only; the manager owns reset ordering, callback invocation, timeout scheduling, and recent-reset hint seeding.
- **Recent-reset recovery**: Short-lived in-memory hints are consulted only when no active non-`idle` state remains and the current reply is a narrow bare confirmation such as `yes`, `no`, or `ok`.
- **Stubs**: All steps are no-ops except `classifyIntentAndComplexity` (sets chat/trivial) and `generateResponse` (placeholder text). Stubs are replaced incrementally as real implementations are built.

## Dependencies

- imports from: `@/shared/types`, `@/shared/logger`
- imported by: `src/app.ts` (gateway integration)

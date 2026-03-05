# Pipeline

## Purpose

Sequential message processing pipeline (12 numbered steps + sub-step 2a + dialog evaluation = 14 step slots). Receives a platform-agnostic `MessageInput`, executes steps in canonical order, and returns a response string. Steps are pluggable functions injected at construction time (dependency injection). Implements the core processing flow from spec `4_4_System_Architecture.md`.

## Key Files

- `types.ts` -- Pipeline type definitions: `PipelineStepName`, `PipelineStep`, `PipelineSteps`, `PipelineContext`, `STEP_ORDER`, route handler types
- `orchestrator.ts` -- `createPipeline()` factory that returns an `(input: MessageInput) => Promise<string>` function
- `router.ts` -- `resolveRoute()` pure function mapping intents to route keys; `createRouteStep()` factory with Closure-safe switch-based dispatch
- `steps/route-handlers.ts` -- `createRouteHandlers(deps)` factory producing `RouteHandlers` with unknown->chat delegation and metadata-only logging
- `steps/stubs.ts` -- `createStubSteps()` and `createStubRouteHandlers()` for testing and initial wiring
- `steps/classify-intent-and-complexity.ts` -- Step 8 factory for LLM-based intent/complexity classification with runtime validation and fail-open fallback
- `steps/evaluate-dialog-state.ts` -- Dialog state evaluation step (runs after classification, before routing): loads persisted state, evaluates timeout/off-topic/continuation/bare-confirmation recovery via domain manager

## Interfaces

- `PipelineSteps` -- exported from `types.ts`, defines all 14 step slots; consumed by `createPipeline()`
- `PipelineContext` -- mutable accumulator passed through all steps; includes `dialogState`, `dialogContext`, `dialogDecision` fields; exported from `types.ts`
- `EvaluateDialogStateDeps` -- exported from `steps/evaluate-dialog-state.ts`; requires `dialogManager: DialogStateManager`
- `RouteHandlers` -- exported from `types.ts`; maps `RouteHandlerKey` to handler functions
- `RouteHandlerDeps` -- exported from `steps/route-handlers.ts`; dependency interface for `createRouteHandlers()` (onChat, onMemory, onReminder, onSystem)
- `MessageInput` -- imported from `@/shared/types`; platform-agnostic message representation

## Patterns and Decisions

- **Step execution**: Steps run sequentially in `STEP_ORDER`. Each step receives `(ctx, log)`.
- **Early exit**: Any step can set `ctx.earlyResponse` to skip remaining steps (except `update_processing_status`).
- **Error handling**: Main loop is wrapped in try/catch. On error, `ctx.error` is set, `update_processing_status` runs in a nested try/catch, and `FALLBACK_RESPONSE` is returned.
- **Logging**: Metadata only (userId, messageId, step name, duration). Never log full message text (NFR-OBS.1).
- **Step timing**: Each step's duration (ms) is recorded in `ctx.stepTimings`.
- **update_processing_status always runs**: It is excluded from the main loop and invoked separately after both success and failure paths.
- **Stubs**: All steps are no-ops except `classifyIntentAndComplexity` (sets chat/trivial) and `generateResponse` (placeholder text). Stubs are replaced incrementally as real implementations are built.
- **Route dispatch**: `createRouteStep()` uses explicit switch-based dispatch (Closure-safe — avoids `handlers[key]` dynamic property access). Unrecognized intents resolve to `unknown` route key and log a warning with metadata only.
- **Unknown->chat delegation**: `createRouteHandlers()` wires the `unknown` handler to delegate to the `chat` handler after logging a warning. This satisfies the IA "unrecognized -> chat" requirement while preserving observability.
- **Classification step constraints**: Step 8 keeps user input isolated from system prompt at call boundaries, validates output via domain functions, forces non-chat intents to `standard`, and logs metadata only.

## Dependencies

- imports from: `@/shared/types`, `@/shared/logger`, `@/domain/dialog/types`, `@/domain/dialog/state-manager`
- imported by: `src/app.ts` (gateway integration)

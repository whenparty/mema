# Pipeline

## Purpose

Sequential message processing pipeline (12 numbered steps + sub-step 2a = 13 step slots). Receives a platform-agnostic `MessageInput`, executes steps in canonical order, and returns a response string. Steps are pluggable functions injected at construction time (dependency injection). Implements the core processing flow from spec `4_4_System_Architecture.md`.

## Key Files

- `types.ts` -- Pipeline type definitions: `PipelineStepName`, `PipelineStep`, `PipelineSteps`, `PipelineContext`, `STEP_ORDER`, route handler types
- `orchestrator.ts` -- `createPipeline()` factory that returns an `(input: MessageInput) => Promise<string>` function
- `router.ts` -- `resolveRoute()` pure function mapping intents to route keys; `createRouteStep()` factory for the route_intent slot
- `steps/stubs.ts` -- `createStubSteps()` and `createStubRouteHandlers()` for testing and initial wiring
- `steps/classify-intent-and-complexity.ts` -- Step 8 factory for LLM-based intent/complexity classification with runtime validation and fail-open fallback

## Interfaces

- `PipelineSteps` -- exported from `types.ts`, defines all 13 step slots; consumed by `createPipeline()`
- `PipelineContext` -- mutable accumulator passed through all steps; exported from `types.ts`
- `RouteHandlers` -- exported from `types.ts`; maps `RouteHandlerKey` to handler functions
- `MessageInput` -- imported from `@/shared/types`; platform-agnostic message representation

## Patterns and Decisions

- **Step execution**: Steps run sequentially in `STEP_ORDER`. Each step receives `(ctx, log)`.
- **Early exit**: Any step can set `ctx.earlyResponse` to skip remaining steps (except `update_processing_status`).
- **Error handling**: Main loop is wrapped in try/catch. On error, `ctx.error` is set, `update_processing_status` runs in a nested try/catch, and `FALLBACK_RESPONSE` is returned.
- **Logging**: Metadata only (userId, messageId, step name, duration). Never log full message text (NFR-OBS.1).
- **Step timing**: Each step's duration (ms) is recorded in `ctx.stepTimings`.
- **update_processing_status always runs**: It is excluded from the main loop and invoked separately after both success and failure paths.
- **Stubs**: All steps are no-ops except `classifyIntentAndComplexity` (sets chat/trivial) and `generateResponse` (placeholder text). Stubs are replaced incrementally as real implementations are built.
- **Classification step constraints**: Step 8 keeps user input isolated from system prompt at call boundaries, validates output via domain functions, forces non-chat intents to `standard`, and logs metadata only.

## Dependencies

- imports from: `@/shared/types`, `@/shared/logger`
- imported by: `src/app.ts` (gateway integration)

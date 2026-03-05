# Classification Module

## Purpose

Pure domain validation for intent and complexity classification (pipeline step 8).
Validates LLM-produced classification results against the 14-value intent taxonomy
and 2-value complexity enum, and applies a conservative complexity guardrail
that forces non-chat intents to `standard` complexity.

## Key Files

- `validate.ts` -- type guards, validation, and guardrail logic (no side effects, no I/O)

## Interfaces

- `ClassificationResult` -- `{ intent: Intent; complexity: Complexity }`, exported from `validate.ts`, used by pipeline step
- `isValidIntent(value)` -- type guard for the 14-value `Intent` union
- `isValidComplexity(value)` -- type guard for the `Complexity` union
- `validateClassification(raw)` -- validates unknown input, returns `ClassificationResult | null`
- `applyComplexityGuardrail(result)` -- forces `standard` for all non-chat intents (AC4)
- `VALID_INTENTS` -- readonly array of all 14 intent values (single source of truth for JSON schema enum)
- `VALID_COMPLEXITIES` -- readonly array of both complexity values

## Patterns & Decisions

- `satisfies readonly Intent[]` on the intents array provides compile-time verification without casting
- Set-based membership check for O(1) type guard performance
- Guardrail returns original reference when no change needed (avoids unnecessary allocation)
- All functions are pure -- no logging, no I/O, no exceptions thrown
- Spike 003 finding: models over-classify as trivial, hence the conservative guardrail

## Dependencies

- imports from: `@/shared/types` (Intent, Complexity)
- imported by: `@/pipeline/steps/classify-intent-and-complexity.ts`

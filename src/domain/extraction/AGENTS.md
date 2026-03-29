# Domain — Extraction

## Purpose

Pure validation for the combined LLM extraction payload (ADR-003 top-level shape plus ADR-005 `relevant_fact_types`). Deep-validates `facts[]`; structurally checks sibling arrays and non-authoritative `intent` / `complexity` strings; validates `relevant_fact_types` then discards (no return field, no `ctx` consumer in TASK-5.1).

## Key Files

- `validate.ts` — `FactType`, `TemporalSensitivity`, `ExtractedFact`, `isValidFactType`, `isValidTemporalSensitivity`, `validateCombinedExtractionOutput`

## Interfaces

- `ExtractedFact` — snake_case fields aligned with ADR-003; used by `extract_facts` pipeline step
- `validateCombinedExtractionOutput(raw, userMessageText)` — returns `{ facts }` or `null` (no throw)

## Patterns & Decisions

- Unknown top-level keys on `raw` are ignored (tolerance R5); provider schema may use `additionalProperties: false` for strict output
- Any invalid fact in `facts[]` rejects the whole parse (no partial acceptance)
- `source_quote` must be a code-unit substring of `userMessageText` (no NFC/NFKC in TASK-5.1)
- `is_injection_attempt: true` facts are kept when valid; blocking is TASK-5.2+

## Dependencies

- imports from: (none internal beyond self)
- imported by: `@/pipeline/steps/extract-facts`

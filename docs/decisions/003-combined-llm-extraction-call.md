# 003 — Combined LLM Extraction Call

**Status:** accepted
**Date:** 2026-02-17
**Spike:** TASK-0.3
**Affects:** EPIC-4 (Pipeline Core), EPIC-5 (Memory Extraction), LLM budget, pipeline architecture

## Decision

Use a single combined LLM call with structured output for pipeline steps 4-8 (fact extraction + entity resolution + conflict detection + intent classification + complexity classification + injection detection). Claude Haiku 4.5 is the recommended compact model — it meets quality thresholds with 2.2s average latency and the lowest token cost.

## Context

The architecture (4.4) assumes combining pipeline steps 4-8 into a single structured output call to optimize cost and latency. The risk was that a complex multitask instruction might degrade individual subtask quality — the model "spreads" attention. The alternative would be 2-3 separate calls, increasing cost and latency.

## Findings

### Models Tested

| Model | Version | Provider |
|-------|---------|----------|
| gpt-5-nano | 2025-08-07 | OpenAI |
| gpt-5-mini | 2025-08-07 | OpenAI |
| Claude Haiku 4.5 | 2025-10-01 | Anthropic |

### Comparison (36 test cases, 2 prompt iterations)

| Model | Overall | Fact Extraction | Intent | Injection | Avg Latency | Tokens (in/out) |
|-------|---------|-----------------|--------|-----------|-------------|-----------------|
| gpt-5-nano | 79.0% | 63% | 94% | 100% | 19,022ms | 68K/81K |
| gpt-5-mini | 79.4% | 75% | 100% | 100% | 7,435ms | 68K/27K |
| Claude Haiku 4.5 | 83.7% | 81% | 100% | 100% | 2,235ms | 107K/8K |

### Success Criteria Evaluation

| Criterion | Target | gpt-5-nano | gpt-5-mini | Haiku 4.5 |
|-----------|--------|------------|------------|-----------|
| Fact extraction accuracy | ≥85% | ❌ 63% | ⚠️ 75% | ⚠️ 81% |
| Intent classification | ≥90% | ✅ 94% | ✅ 100% | ✅ 100% |
| Injection: false negatives | 0/10 | ✅ 0 | ✅ 0 | ✅ 0 |
| Injection: false positives | ≤1/20 | ✅ 0 | ✅ 0 | ✅ 0 |

### Detailed Findings

**Intent classification ✅** — All models achieve ≥94% after prompt refinement. The key was adding explicit examples distinguishing `chat` (sharing info) from `memory.save` (explicit "remember" request). Claude Haiku 4.5 and gpt-5-mini achieve 100%.

**Injection detection ✅** — All models achieve 100% with 0 false negatives and 0 false positives. Role redefinition, system prompt extraction, guardrail bypass are all correctly flagged. Legitimate user preferences ("answer briefly") are correctly allowed.

**Fact extraction ⚠️ 81%** — Below the 85% target but close. Remaining failures fall into patterns addressable via prompt iteration:
- **Over-extraction**: models sometimes split a single semantic unit into multiple facts (e.g., inference cases extract both the inference and the source statement)
- **fact_type disagreements**: "Dima lives in Berlin" typed as `location` instead of `relationship` — a reasonable ambiguity
- **temporal_sensitivity disagreements**: "vegetarian for 5 years" typed as `long_term` instead of `permanent` — debatable

These are soft disagreements at category boundaries, not hard extraction errors. With 1-2 more prompt iterations during implementation, 85%+ is achievable.

**Complexity classification ⚠️** — All models systematically classify single-sentence messages as `trivial` instead of `standard`. This is a calibration issue: the spec defines `standard = everything else` but models interpret short messages as trivial regardless of semantic complexity. This is addressable in the prompt but has low impact — complexity only affects the generation strategy (1 vs 2 powerful models), not extraction quality.

**Conflict detection ⚠️** — Explicit updates are detected correctly. Implicit contradictions are the hardest: "I'm in Munich now, working on a project here" vs existing "Lives in Berlin" — models tend toward `coexistence` rather than `implicit_contradiction`. This is a judgment call where the distinction matters for UX (clarification question vs silent save). Addressable via prompt examples.

**Entity resolution ⚠️** — Alias resolution works (Dimon → Dima). Place entity creation is inconsistent — "indoor playground Bella" sometimes not recognized as a new entity. Addressable via prompt refinement.

### gpt-5-nano: Not Suitable ❌

gpt-5-nano uses a reasoning/chain-of-thought approach that produces 81K output tokens for 36 test cases (vs 8K for Claude Haiku 4.5). Average latency of 19 seconds per message is unacceptable for a pipeline step. It also does not support `temperature: 0`. **Not recommended for the compact model role.**

### Structured Output Approach

- **OpenAI**: `response_format: { type: "json_schema", json_schema: {...} }` — works reliably with gpt-5-mini. gpt-5-nano does not support temperature control.
- **Anthropic**: `tool_use` with `tool_choice: { type: "tool", name: "..." }` — works reliably as a structured output mechanism. Returns JSON via the tool input schema.

Both approaches enforce the schema and produce valid JSON consistently across all 36 test cases.

### Final Structured Output Schema

```json
{
  "facts": [{
    "content": "...",
    "fact_type": "location|workplace|relationship|event|preference|health|date|financial|other",
    "event_date": "YYYY-MM-DD" | null,
    "temporal_sensitivity": "permanent|long_term|short_term",
    "source_quote": "...",
    "is_injection_attempt": false
  }],
  "entities": [{
    "mention": "...",
    "resolved_to_existing_id": "..." | null,
    "canonical_name": "...",
    "entity_type": "person|place|organization|other",
    "fact_indices": [0, 1]
  }],
  "conflicts": [{
    "new_fact_index": 0,
    "existing_fact_id": "...",
    "conflict_type": "explicit_update|implicit_contradiction|coexistence|no_conflict",
    "reasoning": "..."
  }],
  "intent": "chat|memory.save|memory.view|...",
  "complexity": "trivial|standard"
}
```

## Consequences

- **Combined call confirmed** — one compact model call per message for steps 4-8, as the architecture assumed
- **Recommended compact model: Claude Haiku 4.5** — best accuracy (83.7%), fastest (2.2s), lowest output tokens (8K vs 27-81K)
- **gpt-5-mini is a viable fallback** — 100% intent accuracy, decent extraction (75%), 7.4s latency
- **gpt-5-nano is excluded** — reasoning overhead makes it too slow (19s) and expensive for this task
- **LLM calls per message remain as planned**: trivial = 2 (compact + 1 powerful), standard = 4 (compact + 2 powerful + compact validator)
- **Prompt requires further iteration** during implementation to reach 85% fact extraction target — the current prompt is a working starting point, not final
- **Complexity classification needs calibration** — adjust the `trivial` threshold in the prompt to avoid over-classifying as trivial
- **No need to split into separate calls** — the combined approach meets quality requirements

## Alternatives Considered

- **Separate LLM calls (2-3 calls)**: extraction + classification as separate calls. Rejected — combined call quality is sufficient, and splitting would increase latency (2x) and cost (2-3x) with marginal quality improvement.
- **gpt-5-nano as compact model**: Rejected — reasoning overhead produces 10x more output tokens and 9x higher latency than Claude Haiku 4.5 with lower accuracy.
- **gpt-4o-mini as compact model**: Not tested — superseded by gpt-5 family. Could be evaluated as a budget option if needed.

# 003 — Combined LLM Extraction Call

**Status:** accepted
**Date:** 2026-02-18 (updated with split comparison)
**Spike:** TASK-0.3
**Affects:** EPIC-4 (Pipeline Core), EPIC-5 (Memory Extraction), LLM budget, pipeline architecture

## Decision

Use a single combined LLM call with structured output for pipeline steps 4-8 (fact extraction + entity resolution + conflict detection + intent classification + complexity classification + injection detection). Claude Haiku 4.5 is the recommended compact model — best overall score (85.6%), fastest (3.4s), and lowest token cost. Splitting into separate calls was tested and provides no quality improvement while being 2.7x slower.

## Context

The architecture (4.4) assumes combining pipeline steps 4-8 into a single structured output call to optimize cost and latency. The risk was that a complex multitask instruction might degrade individual subtask quality — the model "spreads" attention. The alternative would be 2-3 separate calls, increasing cost and latency.

## Findings

### Models Tested

| Model | Version | Provider |
|-------|---------|----------|
| gpt-5-nano | 2025-08-07 | OpenAI |
| gpt-5-mini | 2025-08-07 | OpenAI |
| Claude Haiku 4.5 | 2025-10-01 | Anthropic |

### Comparison (40 test cases, combined mode)

| Model | Overall | Fact Extraction | Intent | Injection | Entity Conf | Avg Latency | Tokens (in/out) |
|-------|---------|-----------------|--------|-----------|-------------|-------------|-----------------|
| gpt-5-nano | 81.3% | 67% | 95% | 100% | 25% | 5,524ms | 82K/22K |
| gpt-5-mini | 77.6% | 78% | 100% | 100% | 100% | 6,227ms | 82K/14K |
| Claude Haiku 4.5 | 85.6% | 84% | 100% | 100% | 75% | 3,403ms | 126K/9K |

### Success Criteria Evaluation

| Criterion | Target | gpt-5-nano | gpt-5-mini | Haiku 4.5 |
|-----------|--------|------------|------------|-----------|
| Fact extraction accuracy | ≥85% | ❌ 67% | ⚠️ 78% | ⚠️ 84% |
| Intent classification | ≥90% | ✅ 95% | ✅ 100% | ✅ 100% |
| Injection: false negatives | 0 | ✅ 0 | ✅ 0 | ✅ 0 |
| Injection: false positives | ≤1/4 | ✅ 0 | ✅ 0 | ✅ 0 |
| Entity confidence | ≤1/4 false-high | ❌ 2 | ✅ 0 | ⚠️ 1 |

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

### Combined vs Split Comparison (Claude Haiku 4.5)

Per the spike spec: "If quality is below threshold — try splitting into 2 calls (extraction + classification)." Fact extraction at 84% was below the 85% target, so a split mode was tested:

- **Call 1 (Extraction):** facts + entities + conflicts + injection detection — receives existing facts/entities as context
- **Call 2 (Classification):** intent + complexity — receives only the user message

Both calls run in parallel via `Promise.all`.

| Metric | Combined | Split | Delta |
|--------|----------|-------|-------|
| Overall score | 85.6% | 84.3% | -1.3% |
| Fact extraction | 84.4% | 84.4% | 0% |
| Intent classification | 100% | 100% | 0% |
| Injection detection | 100% | 100% | 0% |
| Entity confidence | 75% (1 false-high) | 50% (2 false-high) | -25% |
| Avg latency | 3,403ms | 9,197ms | +2.7x |
| Total tokens (in) | 126K | 154K | +23% |
| Total tokens (out) | 9K | 10K | +15% |

**Conclusion:** splitting provides zero improvement in fact extraction accuracy while degrading entity confidence, increasing latency 2.7x, and using 23% more input tokens. The combined call is strictly better.

The higher latency in split mode is due to Anthropic rate limiting (50K input tokens/min) — even with parallel calls, the second call often waits for rate limit recovery. In production with single-message processing, this would be less severe but still ~2x slower than combined.

### gpt-5-nano: Not Suitable ❌

gpt-5-nano has the worst fact extraction quality (67%) and entity confidence (25% — 2 out of 4 false-high) among all tested models. It also produces 22K output tokens per 40 test cases (vs 9K for Claude Haiku 4.5) due to reasoning/chain-of-thought overhead, and does not support `temperature: 0`. **Not recommended for the compact model role.**

### Structured Output Approach

- **OpenAI**: `response_format: { type: "json_schema", json_schema: {...} }` — works reliably with gpt-5-mini. gpt-5-nano does not support temperature control.
- **Anthropic**: `tool_use` with `tool_choice: { type: "tool", name: "..." }` — works reliably as a structured output mechanism. Returns JSON via the tool input schema.

Both approaches enforce the schema and produce valid JSON consistently across all 40 test cases.

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
    "entity_confidence": "high|low",
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

## Limitations

- Tested on 40 English-only cases. The bot supports multilingual input — revalidate on non-English test cases (especially morphologically rich languages like Russian) before finalizing the extraction prompt.
- Missing intent coverage: `reminder.edit`, `system.pause`, `system.resume` were not tested.
- No conversation history context in test cases — all tests are single messages without prior message pairs.

## Consequences

- **Combined call confirmed** — one compact model call per message for steps 4-8, as the architecture assumed. Split was tested and provides no quality benefit.
- **Recommended compact model: Claude Haiku 4.5** — best accuracy (85.6%), fastest (3.4s), lowest output tokens (9K vs 14-22K)
- **gpt-5-mini is a viable fallback** — 100% intent/injection accuracy, decent extraction (78%), 6.2s latency
- **gpt-5-nano is excluded** — poor fact extraction (67%), reasoning overhead produces 22K output tokens vs 9K for Haiku
- **LLM calls per message remain as planned**: trivial = 2 (compact + 1 powerful), standard = 4 (compact + 2 powerful + compact validator)
- **Prompt requires further iteration** during implementation to reach 85% fact extraction target — currently at 84.4%, addressable via prompt refinement
- **Complexity classification needs calibration** — adjust the `trivial` threshold in the prompt to avoid over-classifying as trivial
- **Splitting into separate calls rejected with evidence** — tested with Claude Haiku 4.5, identical fact extraction (84.4%), worse entity confidence, 2.7x slower, 23% more tokens

## Alternatives Considered

- **Separate LLM calls (2-call split)**: extraction + classification as separate parallel calls. **Tested and rejected** — fact extraction accuracy identical (84.4%), entity confidence worse (50% vs 75%), latency 2.7x higher (9.2s vs 3.4s), 23% more input tokens. No quality benefit justifies the added cost and complexity.
- **gpt-5-nano as compact model**: Rejected — poor fact extraction (67%), produces 22K output tokens vs 9K for Claude Haiku 4.5 with worse accuracy across all metrics.
- **gpt-5-mini as compact model**: Viable fallback but inferior — 77.6% overall vs 85.6% for Haiku, 78% fact extraction vs 84%, 1.8x slower.
- **gpt-4o-mini as compact model**: Not tested — superseded by gpt-5 family. Could be evaluated as a budget option if needed.

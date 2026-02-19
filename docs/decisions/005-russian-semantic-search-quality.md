# 005 — Russian Semantic Search Quality

**Status:** accepted
**Date:** 2026-02-20
**Spike:** TASK-0.5
**Affects:** TASK-6.1 (Semantic search over facts), Tier 2 context formation, embedding model choice, combined LLM call structured output

## Decision

Use `text-embedding-3-small` with `fact_type` filtering for Tier 2 retrieval. The combined LLM call (step 8) must output `relevant_fact_types` in its structured output — this field is used to filter facts before embedding search. With this strategy, all success criteria are met (direct R@5 89.4%, indirect R@5 62.5%, no colloquial degradation). No additional LLM call required — it's an extension of the existing combined call.

## Context

The bot's primary user language is Russian, which includes colloquial forms, diminutives, mixed Cyrillic-Latin text, and transliteration. TASK-0.2 confirmed pgvector works, but embedding quality for Russian was untested. Poor search quality would break Tier 2 memory retrieval and the core product experience.

## Findings

Tested 50 Russian-language facts (9 fact types, 5 linguistic challenge categories) against 30 queries (direct, indirect, colloquial, mixed-language, temporal). Two search strategies compared: pure cosine similarity vs fact_type-filtered cosine similarity.

### Search Strategy Comparison

| Model + Mode | Overall R@5 | R@10 | R@20 | MRR |
|---|---|---|---|---|
| small, pure | 74.4% | 82.7% | 88.1% | 88.7% |
| **small, filtered** | **84.1%** | **91.0%** | **99.2%** | **95.0%** |
| large, pure | 81.7% | 86.6% | 93.9% | 89.2% |
| large, filtered | 87.3% | 94.3% | 99.2% | 96.7% |

**Key finding:** fact_type filtering gives +9.7% R@5 for small model — closing the gap with large model's pure search. Small + filtered (84.1%) outperforms large + pure (81.7%).

### By Query Type: Pure → Filtered (Recall@5)

| Type | small pure | small filtered | Delta | large pure | large filtered | Delta |
|---|---|---|---|---|---|---|
| Direct (12q) | 70.0% | **89.4%** | **+19.4%** | 78.6% | 89.7% | +11.1% |
| Indirect (8q) | 55.2% | **62.5%** | **+7.3%** | 63.5% | 67.7% | +4.2% |
| Colloquial (4q) | 87.5% | 87.5% | 0% | 100% | 100% | 0% |
| Mixed Ru-En (3q) | 100% | 100% | 0% | 100% | 100% | 0% |
| Temporal (3q) | 100% | 100% | 0% | 100% | 100% | 0% |

Filtering has the biggest impact where it matters most: direct (+19.4%) and indirect (+7.3%) queries. No impact on already-perfect categories.

### By Linguistic Challenge (Fact Retrieval Rate@5, small model)

| Tag | Pure | Filtered |
|-----|------|----------|
| Standard Russian | 63.2% | 76.3% |
| Colloquial | 62.5% | 75.0% |
| Diminutive | 75.0% | 100.0% |
| Mixed Ru-En | 71.4% | 85.7% |
| Transliteration | 33.3% | 33.3% |

### Success Criteria Assessment

| Criterion | small pure | small filtered | Verdict |
|-----------|-----------|----------------|---------|
| Direct R@5 ≥ 80% | 70.0% ❌ | **89.4%** ✅ | PASS with filtering |
| Indirect R@5 ≥ 60% | 55.2% ❌ | **62.5%** ✅ | PASS with filtering |
| Colloquial — no degradation | ✅ | ✅ | PASS |

### Why Fact_Type Filtering Works

The combined LLM call (step 8) already classifies intent. Adding `relevant_fact_types: string[]` to its structured output costs nothing extra — it's the same call. During Tier 2 retrieval, `WHERE fact_type IN (...)` narrows the search space before cosine similarity, so embedding search only competes within the right category:

- "Как здоровье?" → filter `health` → finds allergy, surgery, weight loss (was 0% pure → 100% filtered)
- "Где я живу?" → filter `location` → finds both current city and relocation plans (was 50% → 100%)
- "Чем занимаюсь в свободное время?" → filter `preference, other` → finds hobbies (was 50% → 83%)

### Remaining Gaps

Even with filtering, some queries still miss facts:
- q03 "Расскажи про семью" — misses "сестра учится в университете" (relationship type matched, but embedding similarity too low within large relationship pool)
- q06 "Что люблю есть?" — misses "вегетарианец" (preference type matched, but content not close enough to "еда")
- Transliteration still weak for small model (33.3%) — "Фольксваген Гольф" not found by car-related queries

These residual gaps are addressed by K=10 (recall@10 = 91%) and Tier 1 User Summary.

## Consequences

1. **Use text-embedding-3-small** — with filtering, it outperforms large pure mode at 6.5x lower cost
2. **Add `relevant_fact_types` to combined LLM call (step 8)** — extend the existing structured output schema. No additional LLM call needed. This is the primary retrieval optimization
3. **Tier 2 search: `WHERE fact_type IN (...) ORDER BY embedding <=> query LIMIT 10`** — fact_type filter + cosine similarity + K=10
4. **Tier 1 User Summary remains important** — covers residual gaps in indirect queries where multiple fact types intersect
5. **Stage 2 LLM-driven retrieval is a post-MVP optimization** — not strictly necessary for MVP given filtering passes criteria, but would further improve indirect recall
6. **Transliteration is a weak spot for small model** (33.3%) — acceptable for MVP since most brand names appear in mixed Ru-En form
7. **No text preprocessing needed** — Russian morphology is handled adequately by the embedding model

## Alternatives Considered

| Alternative | Why Rejected |
|-------------|-------------|
| Pure embedding search (no filtering) | Fails 2/3 success criteria for small model. Filtering is free (uses existing LLM call) |
| text-embedding-3-large as default | 6.5x cost increase. Small + filtered (84.1%) already outperforms large + pure (81.7%) |
| Russian-specific embedding model (e.g., DeepPavlov) | Adds dependency, may not handle mixed Ru-En well. OpenAI + filtering is sufficient |
| Text preprocessing (lemmatization) | Added complexity, marginal benefit — model already handles morphology |
| Hybrid search (embedding + full-text) | Fact_type filtering already closes the gap; hybrid adds complexity without proven benefit |

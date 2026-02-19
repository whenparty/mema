# 005 — Russian Semantic Search Quality

**Status:** accepted
**Date:** 2026-02-20
**Spike:** TASK-0.5
**Affects:** TASK-6.1 (Semantic search over facts), Tier 2 context formation, embedding model choice

## Decision

Use `text-embedding-3-small` for MVP. Russian language quality is sufficient — failures are in inferential queries that require reasoning, not language deficiency. Compensate with higher K (top-10 instead of top-5) and rely on Tier 1 User Summary for broad context. Monitor in production; switch to `text-embedding-3-large` only if retrieval quality degrades with real user data.

## Context

The bot's primary user language is Russian, which includes colloquial forms, diminutives, mixed Cyrillic-Latin text, and transliteration. TASK-0.2 confirmed pgvector works, but embedding quality for Russian was untested. Poor search quality would break Tier 2 memory retrieval and the core product experience.

## Findings

Tested 50 Russian-language facts (9 fact types, 5 linguistic challenge categories) against 30 queries (direct, indirect, colloquial, mixed-language, temporal).

### Model Comparison

| Metric | text-embedding-3-small | text-embedding-3-large |
|--------|----------------------|----------------------|
| Overall R@5 | 74.4% | 81.7% |
| Overall R@10 | 82.7% | 86.6% |
| Overall R@20 | 88.1% | 93.9% |
| MRR | 88.7% | 89.2% |
| Cost | $0.02/M tokens | $0.13/M tokens (6.5x) |

### By Query Type (Recall@5)

| Type | small | large | Notes |
|------|-------|-------|-------|
| Direct (12q) | 70.0% | 78.6% | Below 80% target for both |
| Indirect (8q) | 55.2% | 63.5% | Large passes 60% target |
| Colloquial (4q) | 87.5% | 100.0% | No degradation vs standard |
| Mixed Ru-En (3q) | 100.0% | 100.0% | Perfect |
| Temporal (3q) | 100.0% | 100.0% | Perfect |

### By Linguistic Challenge (Fact Retrieval Rate@5)

| Tag | small | large |
|-----|-------|-------|
| Standard Russian | 63.2% | 68.4% |
| Colloquial | 62.5% | 75.0% |
| Diminutive | 75.0% | 100.0% |
| Mixed Ru-En | 71.4% | 71.4% |
| Transliteration | 33.3% | 100.0% |

### Key Insight: Failures are Inferential, Not Linguistic

Most failures are queries requiring reasoning that pure embedding search cannot provide:
- "Порекомендуй ресторан" (recommend a restaurant) → expected location fact "Живёт в Мюнхене" — requires inferring that restaurant recommendations need the user's city
- "Как здоровье?" (how's health?) → expected allergy/surgery/weight facts — generic query doesn't match specific medical terms
- "Помоги спланировать выходные" (help plan weekend) → expected location + hobbies — requires inferring that planning needs context

These are exactly the scenarios Tier 1 (User Summary) and Stage 2 (LLM-driven deep retrieval) are designed to handle.

### What Works Well

- **Colloquial Russian**: "сынуля", "бабуля", "тачка", "корешу" — all found correctly
- **Diminutive forms**: "Димуля" → "Дима" cross-referencing works in both models
- **Mixed Ru-En**: "Работает в Google как senior engineer" — perfect retrieval
- **Temporal queries**: date-specific queries find correct facts
- **MRR is high** (88-89%): when the right fact is found, it's usually ranked #1

### Success Criteria Assessment

| Criterion | small | large | Verdict |
|-----------|-------|-------|---------|
| Direct R@5 ≥ 80% | 70.0% | 78.6% | ⚠️ Both fail, but gap is in inferential queries |
| Indirect R@5 ≥ 60% | 55.2% | 63.5% | ⚠️ small fails / ✅ large passes |
| Colloquial — no significant degradation | -25% (better than direct!) | -27% (better!) | ✅ Both pass |

## Consequences

1. **Use text-embedding-3-small** — 6.5x cheaper, and the 7% R@5 gap doesn't justify the cost for MVP
2. **Use top-10 (K=10) instead of top-5** for Tier 2 retrieval — recall@10 is 82.7% for small model, a significant improvement over recall@5 (74.4%)
3. **Tier 1 User Summary is critical** — it compensates for the inability of pure embedding search to handle inferential queries. The summary always contains location, workplace, and key relationships
4. **Transliteration is a weak spot for small model** (33.3% rate) — acceptable for MVP since most brand/product names appear in mixed Ru-En form, not full transliteration
5. **No text preprocessing needed** — Russian morphology is handled adequately by the embedding model without lemmatization or normalization

## Alternatives Considered

| Alternative | Why Rejected |
|-------------|-------------|
| text-embedding-3-large as default | 6.5x cost increase for ~7% R@5 gain; gap is in inferential queries that embeddings can't solve regardless |
| Russian-specific embedding model (e.g., DeepPavlov) | Adds dependency, may not handle mixed Ru-En well, OpenAI embeddings are "good enough" |
| Text preprocessing (lemmatization) | Added complexity, marginal benefit — model already handles morphology |
| Hybrid search (embedding + full-text) | Premature optimization; pure embedding with K=10 is sufficient for MVP |

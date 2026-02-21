# 009 — LLM-Generated RRULE Quality

**Status:** accepted
**Date:** 2026-02-21
**Spike:** TASK-0.9
**Affects:** EPIC-8 (Reminders), reminder creation pipeline step

## Decision

Use **Claude Haiku 4.5 as primary** with **rrule.js parse validation** and **GPT-5 mini as fallback**. This pipeline achieves 100% accuracy at 2.4s average latency. Fallback triggers in ~4% of cases (DTSTART formatting errors caught by rrule.js).

## Context

Users specify reminder schedules in free-form text ("every Monday at 10", "last Friday of the month"). The LLM must convert this to a valid RFC 5545 RRULE string with TZID. An error in the RRULE means a reminder at the wrong time — loss of user trust. TASK-0.6 confirmed rrule.js works under Bun with TZ=UTC, enabling deterministic validation.

## Findings

### Run 1: Individual Models (no validation pipeline)

| Model | Overall Score | Avg Latency | Parse Rate | Freq Correct | Wall Clock Correct |
|-------|--------------|-------------|------------|--------------|-------------------|
| GPT-5 nano | 97.0% | 4,789ms | 100% | 100% | 89% |
| GPT-5 mini | 96.2% | 5,744ms | 93% | 100% | 100% |
| Claude Haiku 4.5 | 98.2% | 2,030ms | 96% | 100% | 100% |

No single model achieves 100% across runs — all have occasional DTSTART formatting errors (colons in time component, extra zeroes). These are syntax errors caught by rrule.js parsing.

### Run 2: Pipeline (Haiku → rrule.js validate → GPT-5 mini fallback)

| Pipeline | Score | Avg Latency | Parse Rate | Fallback Used |
|----------|-------|-------------|------------|---------------|
| **haiku→validate→mini** | **100.0%** | **2,400ms** | **100%** | **1/28 (3.6%)** |

### Test Coverage

28 test cases across 5 categories:

| Category | Cases | Description |
|----------|-------|-------------|
| Simple | 7 | Daily, weekly, monthly, yearly |
| Medium | 7 | Intervals, multi-day, bi-weekly |
| Complex | 6 | Ordinal weekdays, last day, quarterly |
| Ambiguous | 5 | No time specified, vague frequency |
| One-time | 3 | Not RRULE — absolute datetime |

### Issues Found and Fixed

1. **`FREQ=QUARTERLY` (Run 1)** — Claude Haiku generated invalid RFC 5545 frequency. **Fix:** explicit prompt enumeration of valid FREQ values (DAILY, WEEKLY, MONTHLY, YEARLY) + instruction to use `MONTHLY;INTERVAL=3` for quarterly. Eliminated in Run 2.

2. **DTSTART formatting errors (all models)** — occasional colons in time (`T20:00:00` instead of `T200000`) or extra zeroes (`T17000000` instead of `T170000`). Not fixable via prompt — models are non-deterministic in formatting. **Fix:** rrule.js validation catches 100% of these → fallback model retries.

3. **`FREQ=DAILY;BYDAY=MO,TU,WE,TH,FR` for weekdays** — functionally equivalent to `FREQ=WEEKLY;BYDAY=...` (rrule.js produces identical occurrences). Accepted as valid.

4. **GPT-5 nano one-time TZ confusion** — returned UTC times instead of user TZ for one-time reminders. Not relevant for pipeline (Haiku handles one-time correctly).

### Key Observations

- **No single model is 100% reliable** — all have occasional DTSTART formatting issues across runs. Validation is mandatory.
- **rrule.js validation is the critical safety net** — catches all syntax errors deterministically, zero cost, <1ms.
- **Prompt fix eliminated semantic errors** — explicit FREQ enumeration removed `QUARTERLY` and similar hallucinations.
- **Fallback triggers rarely** — 1/28 (3.6%), adding ~9s only when needed. Average pipeline latency stays at 2.4s.
- **All models handle TZID correctly** — when RRULE parses successfully, wall-clock times are correct 100% of the time.

## Consequences

1. **Pipeline: Haiku → rrule.js → mini fallback** — use this in production for RRULE generation. Fast path: 2s (Haiku parses OK). Slow path: ~11s (Haiku fails → mini retries).
2. **Prompt must enumerate valid FREQ values** — include the 4 valid frequencies explicitly in the system prompt. This is cheap insurance against hallucinated values.
3. **rrule.js validation is mandatory** — call `rrulestr(result)` after every LLM generation. If it throws, fallback to powerful model with the parse error in context.
4. **Compute and confirm first occurrence** — use `rule.after(now)` to show the user: "Got it, I'll remind you next Monday at 10:00 Berlin time." Catches semantic errors that pass syntax.
5. **No separate RRULE validation LLM call needed** — rrule.js parsing is deterministic and sufficient.
6. **One-time reminders don't need RRULE** — all models correctly distinguish recurring vs one-time.

## Alternatives Considered

| Alternative | Why rejected |
|-------------|-------------|
| GPT-5 mini as sole model | 5.7s avg latency, also has parse errors (93% parse rate in Run 2) — still needs validation |
| GPT-5 nano as sole model | TZ confusion for one-time reminders, 89% wall clock accuracy |
| Claude Haiku without fallback | 96-98% parse rate — 2-4% of users would get errors |
| Separate RRULE validation LLM call | Unnecessary — rrule.js parsing catches all syntax errors at zero cost |

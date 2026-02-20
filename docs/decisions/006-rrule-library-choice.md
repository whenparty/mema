# 006 — RRULE Library Choice for Bun

**Status:** accepted
**Date:** 2026-02-21
**Spike:** TASK-0.6
**Affects:** EPIC-8 (Reminders), TASK-0.9 (LLM-generated RRULE), Dockerfile

## Decision

Use **rrule.js v2.8.1** with `TZ=UTC` process environment. The library handles all required RRULE patterns including DST transitions correctly when the process timezone is UTC.

## Context

Recurring reminders store schedules as RRULE with TZID (RFC 5545). The library must parse RRULE strings, compute next occurrences accounting for DST, and work with IANA timezone names. The server runs in Docker where `TZ=UTC` is standard practice.

## Findings

### Libraries Tested

| Library | Version | Result | Notes |
|---------|---------|--------|-------|
| rrule.js | 2.8.1 | ✅ works (with TZ=UTC) | 980K, 1 dep (tslib) |
| rrule-temporal | 1.4.6 | ❌ fails | Requires Temporal API — not available in Bun 1.3 |
| simple-rrule | — | ❌ eliminated | No timezone support |

### rrule.js Results

**Basic operations (no TZID):** all pass regardless of local timezone.

| Test | Result |
|------|--------|
| Import, create, iterate | ✅ |
| Parse RRULE string | ✅ |
| toString round-trip | ✅ |
| Every 3rd Thursday of the month | ✅ |
| Last Friday of the month | ✅ |
| Every 2 weeks on Tuesday | ✅ |
| Last day of the month (BYMONTHDAY=-1) | ✅ |

**TZID + DST (requires TZ=UTC):**

| Test | TZ=UTC | TZ=Australia/Brisbane |
|------|--------|----------------------|
| Weekly Monday 10:00 Europe/Berlin across DST | ✅ 09:00→08:00 UTC | ❌ wrong offsets |
| RRULE string with TZID across DST | ✅ | ❌ |
| after() with TZID post-DST | ✅ | ❌ |
| US/Eastern DST transition | ✅ 14:00→13:00 UTC | ❌ |

**Root cause of TZID failure without TZ=UTC:** rrule.js uses the local timezone as an intermediate step when computing TZID offsets. When local TZ differs from target TZ (e.g., Australia/Brisbane vs Europe/Berlin), the conversion produces wrong UTC times. This is a known design limitation — the library uses `Date` objects which are local-TZ-aware.

**dtstart convention with TZID:** when using the `tzid` option, `dtstart` represents wall-clock time in the target timezone. For "10:00 Berlin", pass `new Date(Date.UTC(2026, 2, 16, 10, 0, 0))` with `tzid: "Europe/Berlin"`. The library converts to correct UTC internally.

### rrule-temporal

- Requires `Temporal` API which is not available in Bun 1.3
- Polyfill (`@js-temporal/polyfill`) does not work — iterator protocol incompatible
- Would be the better long-term choice once Bun ships native Temporal support

## Consequences

1. **Add `TZ=UTC` to Dockerfile** — `ENV TZ=UTC` in the container. This is already Docker best practice
2. **Add `TZ=UTC` to dev scripts** — prefix `bun run dev` with `TZ=UTC` in package.json, or document in AGENTS.md
3. **RRULE strings stored with TZID** — format: `DTSTART;TZID=Europe/Berlin:20260316T100000\nRRULE:FREQ=WEEKLY;BYDAY=MO`
4. **Use `rule.after(date)` to compute `next_trigger_at`** — returns JS Date in UTC, ready for DB storage
5. **Unblocks TASK-0.9** — LLM-generated RRULE validation can use rrule.js to verify generated strings
6. **Revisit when Bun ships Temporal** — rrule-temporal would eliminate the TZ=UTC requirement

## Alternatives Considered

| Alternative | Why rejected |
|-------------|-------------|
| rrule-temporal | Temporal API not in Bun, polyfill incompatible |
| simple-rrule | No timezone support — dealbreaker for TZID+DST |
| rrule.js without TZ=UTC | TZID broken when local TZ != target TZ |
| Custom RRULE parser | Unnecessary — rrule.js covers all RFC 5545 patterns needed |

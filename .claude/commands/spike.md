# Execute Tech Spike

## Input
$ARGUMENTS — task ID in format TASK-0.X (e.g., TASK-0.1)

## Phase 0: Pick Up Task

1. Search GitHub issues in `whenparty/mema` for "$ARGUMENTS" in title
2. Read the issue body
3. Move issue to "In Progress" on the project board
4. Add comment: "🔬 Spike investigation started"
5. Read `docs/specification/5_3_Tech_Spikes.md` — find the spike matching this task
6. Extract: question, context, success criteria, research plan, impact on backlog
7. Read any related specification docs referenced in the spike
8. Check dependency issues — if any are open, STOP, move issue back to Backlog, 
   add comment listing blockers

## Phase 1: Prepare Environment

1. Create temporary directory: `/tmp/spike-{task-id}`
2. Initialize minimal Bun project there
3. Start any required services (PostgreSQL, etc.) via Docker if not running

## Phase 2: Execute Research Plan

Follow the research plan from 5_3 step by step.
For each test:
- Note library name and version
- Run the test
- Record result: ✅ works / ⚠️ works with workaround / ❌ doesn't work
- If workaround needed — document it
- If fails — try alternatives mentioned in the spike doc

## Phase 3: Write Decision

1. Create `docs/decisions/NNN-{short-name}.md` using `docs/decisions/TEMPLATE.md`
2. Fill in: Decision, Findings, Consequences, Alternatives Considered
3. Update `docs/decisions/README.md` — change status from "pending" to result
4. Update AGENTS.md — Spike Results table with one-line summary
5. Clean up `/tmp/spike-*`

## Phase 4: Close Task

1. Add comment to issue with findings summary:
```
   ## Spike Result
   - Component A: ✅ / ⚠️ / ❌
   - Component B: ✅ / ⚠️ / ❌
   
   Decision: docs/decisions/NNN-name.md
   Impact on backlog: [any changes needed]
```
2. Move issue to "Done" on the project board
3. Close the issue
4. Update AGENTS.md "Current Sprint" section — move task to Completed

Present suggested commit message. STOP and wait for user to commit.

## Rules

- This is RESEARCH — code is throwaway, never goes in src/
- Do NOT use TDD or planner/implementer/reviewer workflow
- Always get full spike description from 5_3_Tech_Spikes.md, not just the GitHub issue
- Evaluate against success criteria from 5_3 — partial success = ⚠️, not ✅
- If spike result is ❌ for a critical component: do NOT close issue, 
  add comment with failure details and tag as blocked, STOP and ask user for decision

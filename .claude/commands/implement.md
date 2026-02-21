# Implement Task

## Input
$ARGUMENTS — task ID in format TASK-X.Y (e.g., TASK-1.1)

## Phase 0: Pick Up Task

Launch a **general-purpose** subagent (`Task` tool, `subagent_type: general-purpose`).
Pass it the task ID and instruct it to:

1. Search GitHub issues in `whenparty/mema` for "$ARGUMENTS" in title
2. Read the issue body — extract description, dependencies, traceability (FR/NFR/US refs)
3. Read `docs/specification/5_1_Backlog.md` — find the task, extract estimate/deps/traceability/labels
4. Check dependency issues — report which are open vs closed
5. Read `.claude/skills/specification-navigator/SKILL.md` first, then follow its reading
   strategy to find and read specification docs referenced in traceability.
   Summarize relevant requirements — do NOT return full doc text
6. Enrich the GitHub issue body by appending:
   ```
   ### Acceptance Criteria
   - [ ] [derived from FR/US/AC in spec docs]
   - [ ] [tests pass, typecheck clean, lint clean]

   ### Key Files
   - `src/path/to/file.ts` — [what it does]

   ### Spec References
   - [FR-MEM.1](docs/specification/3_1_Functional_Requirements.md) — [short description]
   ```
7. Read module AGENTS.md files for affected modules (if they exist)

The subagent returns a **task brief**:
```
Task: TASK-X.Y — [title]
Estimate: N h
Dependencies: all closed | [list of open blockers]
Acceptance Criteria: [checklist]
Spec Summary: [key requirements in 5-10 lines]
Key Files: [existing files to modify + new files to create]
Module Context: [summary from module AGENTS.md, or "new module"]
```

**Orchestrator actions** (after receiving the brief):
- If dependencies are open — STOP, ask user for decision
- Move issue to "In Progress" on the project board
- Add comment: "🚀 Implementation started"

## Phase 1: Plan

Launch a **planner** subagent (`Task` tool, `subagent_type: planner`). Pass it:
- The task brief from Phase 0 (includes module context summary and key files)

The planner has Read access — it will read module AGENTS.md files and spec docs itself,
guided by the Key Files and Spec References in the brief.
Runs 3 rounds of self-verification (structure → scope → codebase fit)
and returns a step-by-step plan.

## Phase 1a: Verify Plan

Launch a **plan-verifier** subagent (`Task` tool, `subagent_type: plan-verifier`). Pass it:
- The plan from Phase 1
- Task description and acceptance criteria from the brief

The verifier checks: AC coverage, file path validity, TDD order, scope, conventions.
Returns PASS or FAIL with specific issues.

If **FAIL**: launch a new **planner** subagent with the original brief + current plan +
verifier issues. Planner revises the plan, then re-run plan-verifier. Max 2 cycles.

After PASS: present the plan to me and **STOP — wait for my approval**.
If planner flagged clarifications — relay them to me, do NOT proceed.

## Phase 2: Implement + Validate

After plan approval, launch an **implementer** subagent
(`Task` tool, `subagent_type: implementer`). Pass it:
- The approved plan (full text)
- Any clarifications or decisions from Phase 1 discussion

The implementer writes code following TDD using `bun test <file> --reporter=dots`
for minimal output. Returns a summary of changes (files created/modified, issues encountered).
The implementer does NOT run full validation — that's the validator's job.

After implementer completes, launch a **validator** subagent
(`Task` tool, `subagent_type: validator`).
It runs `bun test`, `bun run typecheck`, `bun run lint` and returns a structured report:
result (PASS/FAIL), test count, failure list with file:line (max 10 per section).

If validator returns **FAIL**:
- Launch the **implementer** subagent again with: the approved plan + validator failure output
- Re-run validator after fixes
- Maximum 3 fix cycles. If still failing, STOP and present failures to me

## Phase 3: Review

1. Move issue to "In Review" on the project board
2. Launch a **reviewer** subagent (`Task` tool, `subagent_type: reviewer`).
   Pass it: the plan and the task brief for context.
   The reviewer returns a verdict: APPROVED / NEEDS_REVISION / FAILED

If verdict is **NEEDS_REVISION**, classify the issues:

**Trivial fixes** (missing file in commit, add line to .gitignore, fix typo, adjust config value):
- Apply the fix yourself directly (Edit/Write tool) — do NOT launch implementer
- Re-run **validator** only (no reviewer re-run needed)
- If validator passes — proceed to Phase 4, note the fix as a deviation

**Code changes** (logic errors, missing test cases, security issues, wrong patterns):
- Launch the **implementer** subagent with: the approved plan + review feedback
- Re-run validator
- Re-run reviewer
- Maximum 3 revision cycles. If still not APPROVED, STOP
  and present all unresolved issues to me

If verdict is **FAILED**:
- STOP and present the failure to me

If verdict is **APPROVED**:
- Proceed to Phase 4

## Phase 4: Close Task

Launch a **general-purpose** subagent (`Task` tool, `subagent_type: general-purpose`).
Pass it: task brief, approved plan, change summary from implementer, review verdict,
and list of deviations (what changed vs plan). Instruct it to:

1. **Update issue with deviations** — edit the GitHub issue description, appending:
   ```
   ### Deviations
   - [what changed vs original plan and why]
   - [anything discovered during implementation]
   - [scope added/removed with reason]
   ```
   If no deviations — append `### Deviations\nNone.`
2. Add closing comment: verdict + files changed + test count
3. Move issue to "Done" on the project board
4. Update AGENTS.md — "Current Sprint" section:
   - Move task from "In progress" / "Next" to "Completed"
   - Update "Next" with the next unblocked task (check dependencies)
5. **Update module AGENTS.md** — for each module directory touched by this task:
   - If `AGENTS.md` doesn't exist — create it (see template in root AGENTS.md)
   - If it exists — update Key Files, Interfaces, Patterns sections to reflect changes
   - Update the Module Documentation table in root AGENTS.md if a new module was added

The subagent returns a suggested conventional commit message referencing the issue
(e.g., `feat(db): add schema and migrations closes #42`).

Present the commit message and the execution summary to me. STOP and wait for me to commit.

## Execution Summary

After Phase 4 completes, present this summary:

```
## Execution Summary: TASK-X.Y

### Subagent Invocations
| Subagent | Invocations | Context (tokens / tool calls) | Reason for re-runs | Return to user |
|----------|:-----------:|:-----------------------------:|---------------------|----------------|
| context-loader  | 1 | NK / N calls | — | No |
| planner         | N | NK / N calls | [verifier FAIL × (N-1)] | No |
| plan-verifier   | N | NK / N calls | [planner revisions × (N-1)] | Yes — plan approval |
| implementer     | N | NK / N calls | [validator FAIL × A, review × B] | No |
| validator       | N | NK / N calls | [impl fix × A, review fix × B] | No |
| reviewer        | N | NK / N calls | [revision × (N-1)] | No |
| close-task      | 1 | NK / N calls | — | Yes — commit |
| **Total**       | **N** | **~NK / N calls** | | **N stops** |

### Returns to User
| # | Phase | Reason | Was it necessary? |
|---|-------|--------|-------------------|
| N | After Phase Na | [reason] | [Yes/No — assessment] |

### Context Efficiency
| Subagent | Assessment |
|----------|------------|
| [name] | [Efficient/Heavy — reason, e.g. "re-read files already loaded by context-loader"] |

### Tool Issues
- [tool name] — [what failed and why] (or "None")

### Stops
- Plan approval: [user approved / user modified plan / N clarification rounds]
- Failures: [none / list of phases where STOP was triggered]
```

Track these counters throughout execution. Increment each time a subagent is launched.
If a subagent reports a tool permission denial or unavailable tool, record it.

### Recommendations for Context Optimization

Based on observed patterns:

1. **Planner re-reads context-loader files.** Subagents don't share context —
   this is unavoidable. To minimize: pass spec summaries (not just references)
   from context-loader into the planner prompt so it reads fewer files itself.
2. **Plan-verifier re-reads planner files.** Same issue. Mitigation: include
   relevant file snippets (not just paths) in the plan text itself so the
   verifier can check without re-reading everything.
3. **Reviewer is the heaviest subagent.** It re-reads specs to verify AC coverage.
   Mitigation: pass the AC checklist with spec summaries into the reviewer prompt —
   it should focus on the git diff, not re-research the spec.
4. **Validator is the most efficient.** 3 commands, minimal context — good model
   for what a focused subagent should look like.
5. **Returns to user are mandatory at two points:** plan approval and commit.
   Both are intentional safety gates — do not try to skip them.
6. **Trivial reviewer fixes should not re-trigger the full loop.** If the reviewer
   asks for a minor change (add file to commit, fix config value, add .gitignore entry),
   apply it directly and re-run validator only. Reserve the implementer→validator→reviewer
   loop for actual code changes.

## Context Management

All heavy work runs in subagents to protect the main context window:
- **general-purpose** (Phase 0) — reads issue, backlog, specs; enriches issue; returns task brief
- **planner** — reads specs + codebase, produces plan with 3-round self-verification
- **plan-verifier** — checks plan against AC, file paths, TDD order, conventions
- **implementer** — writes code following TDD with `--reporter=dots` for minimal output
- **validator** — runs test/typecheck/lint, returns structured PASS/FAIL report
- **reviewer** — reads git diff, evaluates correctness/quality/security, returns verdict
- **general-purpose** (Phase 4) — updates GitHub issue, AGENTS.md, module AGENTS.md; returns commit message

The main orchestrator only sees: task brief, plan, verification result, change summary,
validation report, review verdict, commit message.

**Rules for subagent context:**
- Pass full context INTO subagents explicitly — they do not inherit conversation history
- Always pass the approved plan to implementer (including in revision loops)
- In loops, pass only the LATEST failure/review output — not the full history

## Rules

- ALWAYS check dependencies before starting — never implement against open blockers
- Follow TDD strictly: test first, then implementation, then verification
- Do NOT modify files outside the plan scope — if you discover adjacent work needed,
  flag it as a follow-up, do not fix it
- If implementer hits a blocker after 3 attempts at any step, STOP and explain —
  do not loop endlessly
- Present commit message at the end. NEVER run git add/commit/push yourself
- If the task turns out larger than expected mid-implementation, STOP and discuss
  splitting it with me rather than continuing with a bloated PR

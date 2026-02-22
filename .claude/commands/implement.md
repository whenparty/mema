# Implement Task

## Input
$ARGUMENTS — task ID in format TASK-X.Y (e.g., TASK-1.1)

## Phase 0: Pick Up Task

Launch a **general-purpose** subagent (`Task` tool, `subagent_type: general-purpose`).
Pass it the task ID and instruct it to:

Follow `.claude/skills/task-brief/SKILL.md` for the full task brief and
issue enrichment steps.

The subagent returns a **task brief**:
```
Task: TASK-X.Y — [title]
Issue: #<number>
Board Item ID: <PVTI_...>
Estimate: N h
Dependencies: all closed | [list of open blockers]
Acceptance Criteria: [checklist]
Spec Summary: [key requirements in 5-10 lines]
Key Files: [existing files to modify + new files to create]
Module Context: [summary from module AGENTS.md, or "new module"]
```

**Orchestrator actions** (after receiving the brief):
- If dependencies are open — STOP, ask user for decision
- Look up the board item ID from auto memory (`github-project.md` "Known Item IDs")
  using the issue number. If not cached, query the project board via GraphQL and
  cache the result. Attach the item ID to the task brief.
- Create a feature branch: `git checkout -b task/TASK-X.Y` (e.g., `task/TASK-1.2`)
- Use `.claude/skills/github-issue-manager/SKILL.md` to move the issue to In Progress
  and add the start comment

## Phase 1: Plan

Launch a **planner** subagent (`Task` tool, `subagent_type: planner`). Pass it:
- The task brief from Phase 0 (includes module context summary and key files)
- The "Hard Constraints from Spike Decisions" table from AGENTS.md (copy verbatim)

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

### Step 1: Implementation (unit tests + code)

Launch an **implementer** subagent (`Task` tool, `subagent_type: implementer`). Pass it:
- The approved plan (full text)
- Any clarifications or decisions from Phase 1 discussion

The implementer writes code following TDD using `bun test <file> --reporter=dots`
for minimal output. Returns a summary of changes (files created/modified, issues encountered).
The implementer does NOT run full validation — that's the validator's job.

### Step 2: E2E tests (when applicable)

**Trigger:** the task touches Docker files, `src/infra/db/`, `package.json`,
schema/migration files, API endpoints, or pipeline steps. The orchestrator decides.

Launch an **implementer** subagent with a dedicated prompt to write e2e tests.
Pass it **only**:
- The task brief and acceptance criteria
- The approved plan (for context on what the task delivers)
- Do NOT pass the implementer's change summary or file list

E2e tests are **black-box**: written from the AC, not from implementation details.
They verify behavior through the external interface (HTTP endpoints, DB state,
Docker health) without knowledge of internal code structure.

Files go in `tests/e2e/*.test.ts`. Examples:
- Health endpoint returns 200 with `{ status: "ok" }`
- App connects to PostgreSQL and runs a query
- Migration creates expected tables
- API endpoint returns expected response given specific input

The implementer verifies they compile with `bun test tests/e2e/<file> --reporter=dots`
(they may fail without Docker — that's expected and OK).

**Skip this step** for tasks that are purely domain logic (no infra/Docker/API surface).

### Step 3: Validation

Launch a **validator** subagent (`Task` tool, `subagent_type: validator`).
The validator auto-detects whether Docker + e2e checks are needed
(based on presence of `tests/e2e/*.test.ts` files).

Returns a structured report: result (PASS/FAIL), test count, failure list with
file:line (max 10 per section), Docker section (if applicable).

### Failure handling

If validator returns **FAIL**:
- Launch the **implementer** subagent again with: the approved plan + validator failure output
- Re-run validator after fixes
- Maximum 3 fix cycles. If still failing, STOP and present failures to me

## Phase 3: Review

1. Use `.claude/skills/github-issue-manager/SKILL.md` to move the issue to In Review
2. In parallel:
   - Launch a **reviewer** subagent (`Task` tool, `subagent_type: reviewer`).
     Pass it: the plan and the task brief for context.
     The reviewer returns a verdict: APPROVED / NEEDS_REVISION / FAILED
   - Run Copilot review using the instructions in
     `.claude/skills/copilot-reviewer/SKILL.md`.
3. Present both verdicts to me

If verdict is **NEEDS_REVISION**:
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

Launch a **finalizer** subagent (`Task` tool, `subagent_type: finalizer`).
Pass it:
- Task brief (includes issue number and project board item ID)
- Approved plan
- Change summary from implementer
- Review verdict
- List of deviations (what changed vs plan)

The subagent updates the issue with deviations, adds a closing comment, updates
AGENTS.md (sprint + module docs), and returns a suggested conventional commit message
(e.g., `feat(db): TASK-1.3 — add schema and migrations`).

Commit to the feature branch automatically using the suggested commit message:
`git add <files> && git commit -m "<message>"`

Present the execution summary to the user.

Then ask for confirmation to push and merge. **After user confirms**:
1. Merge the feature branch into main: `git checkout main && git merge task/TASK-X.Y`
2. Push to remote: `git push`
3. Close the issue and move it to Done using
   `.claude/skills/github-issue-manager/SKILL.md`
4. Delete the feature branch: `git branch -d task/TASK-X.Y`

## Execution Summary

After Phase 4 completes, present the execution summary using
`.claude/skills/execution-summary/SKILL.md`.

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
4. **Validator is the most efficient.** Minimal context, auto-detects scope — good model
   for what a focused subagent should look like.
5. **Returns to user are mandatory at two points:** plan approval and commit.
   Both are intentional safety gates — do not try to skip them.
6. **All reviewer revisions go through the full loop.** implementer→validator→reviewer.
   This keeps responsibility boundaries clean — the orchestrator never writes code.

## Subagent Responsibility Matrix

Each subagent has a strict scope. No overlaps — if two agents could do the same thing,
only one is responsible.

| Subagent | Role | Reads code | Writes code | Allowed commands | Reads specs |
|----------|------|:----------:|:-----------:|------------------|:-----------:|
| **context-loader** (general-purpose) | Gather task context from GitHub + specs | no | no | `gh` | yes |
| **planner** | Create step-by-step plan | yes | no | none | yes |
| **plan-verifier** | Check plan correctness | yes | no | none | yes |
| **implementer** | Write code via TDD | yes | **yes** | `bun test <file>` only | no |
| **validator** | Run CI + Docker checks (auto-detects e2e) | no | no | `bun test`, `bun run typecheck`, `bun run lint`, `docker compose` + e2e (auto-detected) | no |
| **reviewer** | Evaluate code quality | yes | no | `git diff`, `git status` only | yes |
| **finalizer** | Update GitHub + AGENTS.md | no | **yes** (AGENTS.md only) | `gh` | no |

**Key boundaries:**
- **validator owns CI** — only it runs tests/typecheck/lint/docker. Auto-detects e2e. Reviewer trusts its report.
- **implementer owns TDD** — runs `bun test <file>` per step. Does NOT run full suite.
- **reviewer owns code quality** — reads diffs and files. Does NOT run any build/test/lint.
- **planner and plan-verifier are read-only** — no Bash, no writes.

## Context Management

All heavy work runs in subagents to protect the main context window:
- **general-purpose** (Phase 0) — reads issue, backlog, specs; enriches issue; returns task brief
- **planner** — reads specs + codebase, produces plan with 3-round self-verification
- **plan-verifier** — checks plan against AC, file paths, TDD order, conventions
- **implementer** — writes code following TDD with `--reporter=dots` for minimal output
- **validator** — runs test/typecheck/lint + docker/e2e (auto-detected), returns structured PASS/FAIL report
- **reviewer** — reads git diff, evaluates correctness/quality/security, returns verdict
- **finalizer** (Phase 4) — updates GitHub issue, AGENTS.md, module AGENTS.md; returns commit message

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
- Always work in a feature branch (`task/TASK-X.Y`) — never commit directly to main
- Commit to the feature branch automatically after review is APPROVED — do not ask the user
- NEVER push to remote or merge to main without user confirmation
- If the task turns out larger than expected mid-implementation, STOP and discuss
  splitting it with me rather than continuing with a bloated PR

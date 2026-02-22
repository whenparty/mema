# Implement Task

## Input
$ARGUMENTS — task ID in format TASK-X.Y (e.g., TASK-1.1)

## Phase 0: Pick Up Task

Launch **two subagents in parallel**:

### 0a: Task Brief

Launch a **general-purpose** subagent (`Task` tool, `subagent_type: general-purpose`).
Pass it the task ID and instruct it to:

Follow `.claude/skills/task-brief/SKILL.md` for the full task brief and
issue enrichment steps.

The subagent returns a **task brief** containing full spec context:
```
Task: TASK-X.Y — [title]
Issue: #<number>
Board Item ID: <PVTI_...>
Estimate: N h
Dependencies: all closed | [list of open blockers]
Acceptance Criteria: [checklist]

Full Spec Context:
[full text of every FR, NFR, US, and AC relevant to this task]

Spec Document Map:
[full document map from specification-navigator]

Key Files: [existing files to modify + new files to create]
Module Context: [summary from module AGENTS.md, or "new module"]
```

### 0b: Project Config Summary

Launch an **Explore** subagent (`Task` tool, `subagent_type: Explore`, `model: haiku`).
Instruct it to follow `.claude/skills/config-summary/SKILL.md`.

This summary replaces raw config file reads by subsequent subagents.
Pass it to planner, implementer, and reviewer alongside their other context.

**Orchestrator actions** (after receiving both outputs):
- If dependencies are open — STOP, ask user for decision
- Look up the board item ID from auto memory (`github-project.md` "Known Item IDs")
  using the issue number. If not cached, query the project board via GraphQL and
  cache the result. Attach the item ID to the task brief.
- Create a feature branch: `git checkout -b task/TASK-X.Y` (e.g., `task/TASK-1.2`)
- Use `.claude/skills/github-issue-manager/SKILL.md` to move the issue to In Progress
  and add the start comment

## Phase 1: Plan

Launch a **planner** subagent (`Task` tool, `subagent_type: planner`). Pass it:
- The task brief from Phase 0 (includes full spec context, document map, module context, key files)
- The project config summary from Phase 0
- The "Hard Constraints from Spike Decisions" table from AGENTS.md (copy verbatim)
- If returning from Phase 2 FAIL: the current plan + combined issues from both verifiers

The planner receives the full spec context from the brief. It determines what
**additional** spec documents (if any) are needed beyond what's already in the brief,
using the document map to locate them.
Runs 3 rounds of self-verification (structure → scope → codebase fit)
and returns a step-by-step plan.

## Phase 2: Verify Plan

Launch a **plan-verifier** subagent (`Task` tool, `subagent_type: plan-verifier`). Pass it:
- The plan from Phase 1
- Full spec context and document map from the task brief
- Task description and acceptance criteria from the brief
- Project config summary from Phase 0

The plan-verifier:
1. Reads AGENTS.md (conventions, architecture, testing)
2. Checks AC coverage — for each AC, finds the corresponding test step in the plan
3. Checks scope — unnecessary abstractions, files outside scope, over-engineering, missing steps
4. Checks conventions — named exports, interface > type, architecture rules
5. Runs Copilot CLI with the same context and checklist (following `.claude/skills/copilot-reviewer/SKILL.md`)
6. Returns both verdicts: its own + Copilot's

### Evaluate verdicts

If **either** returns FAIL:
- Return to **Phase 1** with: the current plan + combined issues from both verifiers.
  The planner revises the plan, then Phase 2 runs again.
- If the planner cannot satisfy the verifier's issues — ask the user for a decision.
  If the user approves despite issues, note the override and proceed.

After both PASS: present the plan to me and **STOP — wait for my approval**.
If planner flagged clarifications — relay them to me, do NOT proceed.

## Phase 3: Implement + Validate

### Step 1: Implementation (unit tests + code)

Launch an **implementer** subagent (`Task` tool, `subagent_type: implementer`). Pass it:
- The approved plan (full text)
- The project config summary from Phase 0
- Any clarifications or decisions from Phase 2 discussion

The implementer writes code following TDD using `bun run test <file> --reporter=dots`
for minimal output. Returns a summary of changes (files created/modified, issues encountered).
The implementer does NOT run the full test suite — that's the validator's job.
The implementer MAY run typecheck and lint as needed during implementation.

### Step 2: E2E tests (when applicable)

**Trigger:** the task touches Docker files, `src/infra/db/`, `package.json`,
schema/migration files, API endpoints, or pipeline steps. The orchestrator decides.

Launch a **separate implementer** subagent with a dedicated prompt to write e2e tests.
Pass it **only**:
- The task brief and acceptance criteria
- The approved plan (for context on what the task delivers)
- Do NOT pass the implementer's change summary or file list

E2e tests are **black-box**: written from the AC, not from implementation details.
This is a separate implementer that does not know what the first implementer wrote.
They verify behavior through the external interface (HTTP endpoints, DB state,
Docker health) without knowledge of internal code structure.

Files go in `tests/e2e/*.test.ts`. Examples:
- Health endpoint returns 200 with `{ status: "ok" }`
- App connects to PostgreSQL and runs a query
- Migration creates expected tables
- API endpoint returns expected response given specific input

The implementer verifies they compile with `bun run test tests/e2e/<file> --reporter=dots`
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
- If still failing, STOP and present failures to me

## Phase 4: Review

### Step 0: Prepare

Use `.claude/skills/github-issue-manager/SKILL.md` to move the issue to In Review.

### Step 1: Run reviewer subagent

Launch a **reviewer** subagent (`Task` tool, `subagent_type: reviewer`). Pass it:
- Full spec context (FR/NFR/US) and document map from the task brief
- AGENTS.md (architecture, conventions)
- The approved plan
- The task brief (AC, key files)
- The project config summary from Phase 0

The reviewer:
1. Gathers context: plan, spec documents, AGENTS.md
2. Reviews via `git diff` and `git status`
3. Checks: correctness (plan, AC, traceability), tests (meaningful, behavior vs implementation,
   edge cases), code quality (naming, readability, duplication, error handling, type safety),
   conventions (codebase patterns, AGENTS.md), security (input validation, injection, data isolation)
4. Forms its verdict: APPROVED / NEEDS_REVISION / FAILED
5. Launches Copilot CLI with the same context and checklist
   (following `.claude/skills/copilot-reviewer/SKILL.md`)
6. Waits for Copilot result
7. Returns both verdicts: its own + Copilot's

### Step 2: Evaluate verdicts

If either verdict is **NEEDS_REVISION**:
- Launch the **implementer** subagent with: the approved plan + combined review feedback
- Re-run validator (Phase 3 Step 3)
- Re-run Phase 4 (Step 1)

If either verdict is **FAILED**:
- STOP and present the failure to me

If both verdicts are **APPROVED**:
- Proceed to Phase 5

## Phase 5: Finalize

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

After Phase 5 completes, present the execution summary using
`.claude/skills/execution-summary/SKILL.md`.

Track these counters throughout execution. Increment each time a subagent is launched.
If a subagent reports a tool permission denial or unavailable tool, record it.

See `implement-reference.md` for the subagent responsibility matrix,
context management rules, and context optimization recommendations.

## Rules

- ALWAYS check dependencies before starting — never implement against open blockers
- Follow TDD strictly: test first, then implementation, then verification
- Do NOT modify files outside the plan scope — if you discover adjacent work needed,
  flag it as a follow-up, do not fix it
- Always work in a feature branch (`task/TASK-X.Y`) — never commit directly to main
- Commit to the feature branch automatically after review is APPROVED — do not ask the user
- NEVER push to remote or merge to main without user confirmation
- If the task turns out larger than expected mid-implementation, STOP and discuss
  splitting it with me rather than continuing with a bloated PR

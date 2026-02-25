# /implement — Task Implementation Workflow v2.4

## Input

$ARGUMENTS — task ID in format TASK-X.Y (e.g., TASK-1.7)

## Principles

1. **Orchestrator = pure router.** You (the orchestrator) must NOT use Bash, Read, Grep, Glob, Write, Edit, or any tool except Task and AskUserQuestion. Only Task calls, merge structured outputs, decisions, routing, STOP.
2. **Validate = self-check** (planner checks own plan, implementer checks own code). **Verify = external check** (reviewer checks someone else's work).
3. **Ensemble verification.** Each external verification = two parallel subagents on different models. Both receive **identical input data** and **identical Read permissions**.
4. **Unified process** for all tasks — no triage by complexity.
5. **Subagents return structured results**, orchestrator routes to next phase.
6. **Separation of concerns.** Each subagent does one thing. GitHub/git — only github-agent. Specs — only context-builder. Code — only implementer. Review — only reviewer.

## GitHub Context

The orchestrator MUST use these IDs when passing GitHub context to subagents.
**Never hallucinate or guess IDs — always use the values below.**

```
Project ID:       PVT_kwDOBvUeOc4BPZGN
Status Field ID:  PVTSSF_lADOBvUeOc4BPZGNzg90FRk
Status Options:
  Backlog:        474037f0
  In Progress:    494cf029
  In Review:      34dc5401
  Done:           b3c332a7
```

Board item IDs are queried via GraphQL each time (not cached).
When the github-agent returns a board item ID, the orchestrator stores it in `board_item_id`
and passes it explicitly in all subsequent prompts that need it.

## Agent Files

Subagent definitions live in `.claude/skills/implement/agents/`. Each subagent reads
its own file as first action. The orchestrator references them via
"Follow `.claude/skills/implement/agents/<name>.md`" in the Task prompt.

| Agent | File | subagent_type | model | max_turns |
|-------|------|--------------|-------|-----------|
| context-builder | `skills/implement/agents/context-builder.md` | Explore | opus | 20 |
| config-summary | `skills/implement/agents/config-summary.md` | Explore | haiku | 10 |
| github-agent | `skills/implement/agents/github-agent.md` | general-purpose | haiku | — |
| planner | `skills/implement/agents/planner.md` | Plan | opus | 30 |
| plan-reviewer | `skills/implement/agents/plan-reviewer.md` | Explore | opus | 15 |
| copilot-plan-reviewer | `skills/implement/agents/copilot-plan-reviewer.md` | general-purpose | haiku | 10 |
| implementer | `skills/implement/agents/implementer.md` | general-purpose | opus | 50 |
| e2e-implementer | `skills/implement/agents/e2e-implementer.md` | general-purpose | opus | 25 |
| ci-runner | `skills/implement/agents/ci-runner.md` | general-purpose | haiku | 10 |
| code-reviewer | `skills/implement/agents/code-reviewer.md` | Explore | opus | 20 |
| copilot-code-reviewer | `skills/implement/agents/copilot-code-reviewer.md` | general-purpose | haiku | 10 |
| finalizer | `skills/implement/agents/finalizer.md` | general-purpose | haiku | 15 |

## Orchestrator State

Track across all phases (accumulate, never discard):

| Variable | Source | Phase |
|----------|--------|-------|
| `issue_number` | github-agent | 1.1 |
| `issue_body` | github-agent | 1.1 |
| `deps_status` | github-agent | 1.1 |
| `brief` | context-builder (enriched with board_item_id in 1.3) | 1.2 |
| `config` | config-summary | 1.2 |
| `board_item_id` | github-agent | 1.3 |
| `branch_name` | github-agent | 1.3 |
| `plan` | planner | 2 |
| `plan_verdicts` | plan-reviewer + copilot-plan-reviewer | 3 |
| `changes` | implementer | 4.1 |
| `e2e_changes` | e2e-implementer (if triggered) | 4.2 |
| `ci_report` | ci-runner | 4.3 |
| `diff` | github-agent | 5.0 |
| `changed_files` | github-agent | 5.0 |
| `review_verdicts` | code-reviewer + copilot-code-reviewer | 5.1 |
| `deviations` | orchestrator computes | 6.0 |
| `commit_msg` | finalizer | 6.1 |
| `pr_url` | github-agent | 6.2 |
| `pr_number` | github-agent | 6.2 |

Also track counters: `re_plan_count` (init 0), `ci_run_count` (init 0), `revision_count` (init 0).

---

## Phase 1: Pick Up

### Step 1: Read Issue

Launch **github-agent** (Bash, haiku):

```
description: "Read issue and check deps"
prompt:
  Read and follow .claude/skills/implement/agents/github-agent.md

  Task: Find and read the GitHub issue for {task_id}.
  1. Search: gh issue list --repo whenparty/mema --search "{task_id}" --json number,title,body --limit 5
  2. Read: gh issue view <number> --repo whenparty/mema
  3. Check deps: for each dependency mentioned, check if the issue is open or closed.

  Return:
    Issue: #<number>
    Title: <title>
    Body: <full issue body>
    Dependencies: TASK-X.Y (#N): open|closed (or "None")
    Status: ALL_CLOSED | HAS_OPEN_DEPS
```

**Orchestrator:** parse `issue_number`, `issue_body`, `deps_status`.
If `HAS_OPEN_DEPS` → **STOP**: tell user which deps are open, ask for decision.

### Step 2: Collect Context (parallel)

Launch **two** subagents in a single message:

**context-builder** (Explore, opus, max_turns: 20):

```
description: "Build task brief from specs"
prompt:
  Follow .claude/skills/implement/agents/context-builder.md

  Task ID: {task_id}
  Issue body:
  ---
  {issue_body}
  ---
```

**config-summary** (Explore, haiku, max_turns: 10):

```
description: "Summarize project config"
prompt:
  Follow .claude/skills/implement/agents/config-summary.md
```

### Step 3: Enrich Issue + Create Branch

Launch **github-agent** (Bash, haiku):

```
description: "Enrich issue and create branch"
prompt:
  Read and follow .claude/skills/implement/agents/github-agent.md

  Task: Enrich issue #{issue_number} and create a feature branch.
  1. Edit issue — append AC, key files, spec refs (do not replace existing body):
     gh issue edit {issue_number} --repo whenparty/mema --body "..."
     Enrichment to append:
     ---
     {brief — AC, Key Files, and spec reference sections only}
     ---
  2. Find board item ID (check known cache in agent file, else GraphQL).
  3. Create branch: git checkout -b task/{task_id}

  Return:
    Board Item ID: PVTI_...
    Branch: task/{task_id}
```

**Orchestrator after all Phase 1 outputs:**
- Append `Board Item ID: {board_item_id}` to `brief`
- Store: `brief`, `config`, `board_item_id`, `branch_name`, `issue_number`
- Proceed to Phase 2

---

## Phase 2: Plan

Launch **planner** (Plan, opus, max_turns: 30):

```
description: "Create implementation plan"
prompt:
  Follow .claude/skills/implement/agents/planner.md

  Task Brief:
  ---
  {brief}
  ---

  Project Config:
  ---
  {config}
  ---
```

When returning from Phase 3 FAIL, add to the prompt:

```
  Previous Plan (rejected):
  ---
  {previous_plan}
  ---

  Blocking Issues from reviewers:
  ---
  {blocking_issues}
  ---
```

**Orchestrator:** store `plan`, proceed to Phase 3.

---

## Phase 3: Review Plan

Launch **two** subagents in parallel (identical inputs):

**plan-reviewer** (Explore, opus, max_turns: 15):

```
description: "Review implementation plan"
prompt:
  Follow .claude/skills/implement/agents/plan-reviewer.md

  Plan:
  ---
  {plan}
  ---

  Task Brief:
  ---
  {brief}
  ---

  Project Config:
  ---
  {config}
  ---
```

**copilot-plan-reviewer** (Explore, haiku, max_turns: 10):

```
description: "Copilot review of plan"
prompt:
  Follow .claude/skills/implement/agents/copilot-plan-reviewer.md

  Plan:
  ---
  {plan}
  ---

  Task Brief:
  ---
  {brief}
  ---

  Project Config:
  ---
  {config}
  ---
```

### Verdict routing

Parse both verdicts (look for `Verdict: PASS` or `Verdict: FAIL`):

- **Both PASS** → present plan to user. **STOP — wait for user approval.**
- **Any FAIL** → increment `re_plan_count`
  - If `re_plan_count <= 2` → back to Phase 2 with previous plan + blocking issues
  - If `re_plan_count > 2` → **STOP**: show plan, blocking issues, AC coverage

**STOP artifacts (plan approval):** plan in full, AC coverage from reviewers.
**STOP artifacts (re-plan exhausted):** latest plan, blocking issues, AC coverage.

---

## Phase 4: Implement + Validate

### Step 0: Issue → In Progress

Launch **github-agent** (Bash, haiku):

```
description: "Move issue to In Progress"
prompt:
  Read and follow .claude/skills/implement/agents/github-agent.md

  Task: Move issue #{issue_number} to "In Progress".
  1. GraphQL mutation: move board item {board_item_id} to In Progress (494cf029).
  2. Add comment: gh issue comment {issue_number} --repo whenparty/mema --body "Implementation started"

  Return: "Done"
```

### Step 1: implementer (TDD)

Launch **implementer** (general-purpose, opus, max_turns: 50):

```
description: "Implement task with TDD"
prompt:
  Follow .claude/skills/implement/agents/implementer.md

  Approved Plan:
  ---
  {plan}
  ---

  Task Brief:
  ---
  {brief}
  ---

  Project Config:
  ---
  {config}
  ---
```

When retrying after CI failure or review revision, add:

```
  Additional Notes (fix these issues):
  ---
  {implementer_notes — CI failures or review feedback}
  ---
```

### Step 2: e2e-implementer (conditional)

**Trigger:** orchestrator checks plan's Files section. Launch if ANY path matches:
- `Dockerfile`, `docker-compose*`
- `src/infra/db/**`, `drizzle/**`
- `package.json`, `bun.lock*`
- `src/gateway/**`, `src/pipeline/**`
- `.github/workflows/**`

Or if any AC explicitly requires e2e verification. **Skip** otherwise.

Launch **e2e-implementer** (general-purpose, opus, max_turns: 25):

```
description: "Write e2e tests"
prompt:
  Follow .claude/skills/implement/agents/e2e-implementer.md

  Task Brief (AC only):
  ---
  {brief — AC section only}
  ---

  Plan (for context):
  ---
  {plan}
  ---
```

### Step 3: ci-runner

Launch **ci-runner** (Bash, haiku, max_turns: 10):

```
description: "Run full CI suite"
prompt:
  Follow .claude/skills/implement/agents/ci-runner.md
```

### CI retry loop

- ci-runner `FAIL` → increment `ci_run_count`
  - If `ci_run_count <= 3` → launch implementer with CI failures as notes → re-run ci-runner
  - If `ci_run_count > 3` → **STOP**: show CI report, failing tests, changes

---

## Phase 5: Review Code

### Step 0: Issue → In Review + Prepare Diff

Launch **github-agent** (Bash, haiku):

```
description: "Move to In Review and get diff"
prompt:
  Read and follow .claude/skills/implement/agents/github-agent.md

  Task: Move issue #{issue_number} to "In Review" and collect diff.
  1. GraphQL mutation: move board item {board_item_id} to In Review (34dc5401).
  2. Run: git diff main
  3. Run: git status

  Return:
    DIFF: [full git diff output]
    CHANGED FILES: [list from git status]
```

### Step 1: Review (parallel)

Launch **two** subagents in parallel (identical inputs):

**code-reviewer** (Explore, opus, max_turns: 20):

```
description: "Review code changes"
prompt:
  Follow .claude/skills/implement/agents/code-reviewer.md

  Task Brief:
  ---
  {brief}
  ---

  Approved Plan:
  ---
  {plan}
  ---

  Project Config:
  ---
  {config}
  ---

  Diff:
  ---
  {diff}
  ---

  Changed Files:
  ---
  {changed_files}
  ---
```

**copilot-code-reviewer** (Explore, haiku, max_turns: 10):

```
description: "Copilot review of code"
prompt:
  Follow .claude/skills/implement/agents/copilot-code-reviewer.md

  Task Brief:
  ---
  {brief}
  ---

  Approved Plan:
  ---
  {plan}
  ---

  Project Config:
  ---
  {config}
  ---

  Diff:
  ---
  {diff}
  ---

  Changed Files:
  ---
  {changed_files}
  ---
```

### Verdict routing

- **Both APPROVED, no notes** → Phase 6
- **Both APPROVED, has notes** (non-blocking suggestions from either reviewer) →
  1. Launch implementer with combined notes as `implementer_notes`
  2. Run ci-runner
  3. Proceed to Phase 6 (no re-review needed — changes are minor fixes)
- **Any NEEDS_REVISION** → increment `revision_count`
  - If `revision_count <= 2`:
    1. Launch implementer with combined must-fix + notes as `implementer_notes`
    2. Run ci-runner
    3. Re-run Phase 5 Step 1
  - If `revision_count > 2` → **STOP**: show verdicts, must-fix, CI report
- **Any FAILED** → **STOP**: show failure to user

---

## Phase 6: Finalize

### Step 0: Compute Deviations

Orchestrator compares `plan` vs `changes` + `review_verdicts`:

```
Deviations:
  - From plan: [what changed]
    Reason: [why]
    Impact: [risk/none]
    AC impact: [none | affects ACx]
```

If plan was followed exactly: `Deviations: None`

### Step 1: Prepare Commit

Launch **finalizer** (general-purpose, haiku, max_turns: 15):

```
description: "Prepare commit and update docs"
prompt:
  Follow .claude/skills/implement/agents/finalizer.md

  Task Brief:
  ---
  {brief}
  ---

  Approved Plan:
  ---
  {plan}
  ---

  Changes:
  ---
  {changes}
  ---

  Review Verdict:
  ---
  {review_verdicts}
  ---

  Deviations:
  ---
  {deviations}
  ---
```

**STOP: Present to user for commit confirmation.**
Show: commit message, changes summary, deviations.

### Step 2: Commit + Push + Create PR

After user confirms. Launch **github-agent** (Bash, haiku):

```
description: "Commit, push, and create PR"
prompt:
  Read and follow .claude/skills/implement/agents/github-agent.md

  Task: Commit, push, and create PR.
  Branch: {branch_name}
  Issue: #{issue_number}

  1. git add -A
  2. git commit using heredoc:
     git commit -m "$(cat <<'EOF'
     {commit_msg}
     EOF
     )"
  3. git push -u origin {branch_name}
  4. gh pr create --repo whenparty/mema \
       --title "{task_id} — [short title]" \
       --body "$(cat <<'EOF'
     ## Summary
     {changes — summary section}

     ## Acceptance Criteria
     {brief — AC section as checklist}

     ## Deviations from Plan
     {deviations}

     ## Review Summary
     Both code-reviewer and copilot-code-reviewer: APPROVED

     Closes #{issue_number}

     Generated with [Claude Code](https://claude.com/claude-code)
     EOF
     )"
  5. Add comment to issue with PR link and deviations:
     gh issue comment {issue_number} --repo whenparty/mema \
       --body "PR: <pr_url>\n\nDeviations from plan: {deviations}"

  Return:
    PR: [url]
    PR Number: [number]
```

**Orchestrator:** store `pr_url`, `pr_number`.

**STOP: Present PR URL and ask user for merge confirmation.**
Show: PR url, changes summary, deviations.

### Step 3: Merge PR + Close

After user confirms. Launch **github-agent** (general-purpose, haiku):

```
description: "Merge PR and close issue"
prompt:
  Read and follow .claude/skills/implement/agents/github-agent.md

  Task: Merge PR and clean up.
  PR URL: {pr_url}
  Issue: #{issue_number}
  Board Item ID: {board_item_id}
  Branch: {branch_name}

  1. gh pr merge {pr_url} --squash --repo whenparty/mema
  2. gh issue comment {issue_number} --repo whenparty/mema --body "Implemented and merged. PR: {pr_url}"
  3. gh issue close {issue_number} --repo whenparty/mema
  4. GraphQL mutation: move board item {board_item_id} to Done (b3c332a7).
  5. git checkout main && git pull
  6. git branch -d {branch_name}

  Return: "Done — PR merged, issue closed, branch cleaned up"
```

---

## E2E Trigger Rules

Orchestrator checks the plan's Files section. Launch e2e-implementer if **any** path matches:

```
Dockerfile
docker-compose*
src/infra/db/**
drizzle/**
package.json
bun.lock*
src/gateway/**
src/pipeline/**
.github/workflows/**
```

Or if any AC explicitly mentions e2e, integration, or Docker testing.

---

## Retry Loops Summary

| Loop | Phases | Max cycles | On exhaust |
|------|--------|-----------|------------|
| Plan re-plan | 2 ↔ 3 | 2 cycles | STOP: plan + blocking issues + AC coverage |
| CI fix | 4 (implementer ↔ ci-runner) | 3 total runs | STOP: CI report + failures + changes |
| Code revision | 4 ↔ 5 (implementer → ci → reviewers) | 2 cycles | STOP: verdicts + must-fix + CI report |

---

## STOP Points Summary

| # | Phase | Reason | Show to user |
|---|-------|--------|-------------|
| 1 | 1 | Dependencies open | issue body, deps list |
| 2 | 3 | Plan ready — user approval needed | plan, AC coverage |
| 3 | 3 | 2 re-plan cycles exhausted | plan, blocking issues, AC coverage |
| 4 | 4 | 3 CI runs exhausted | CI report, failing tests, changes |
| 5 | 5 | FAILED from any reviewer | review verdicts, must-fix list, CI report |
| 6 | 5 | 2 revision cycles exhausted | review verdicts, must-fix list, CI report |
| 7 | 6 | User confirms commit | commit message, changes summary, deviations |
| 8 | 6 | User confirms merge | PR url, changes summary |

---

## Rules

- ALWAYS check dependencies before starting — never implement against open blockers
- Follow TDD strictly: test first, then implementation, then verification
- Do NOT modify files outside the plan scope — flag as follow-up, do not fix
- Always work in a feature branch (`task/TASK-X.Y`) — never commit to main directly
- NEVER push to remote or merge without user confirmation
- If the task grows beyond expected scope — STOP and discuss splitting
- Orchestrator uses ONLY Task and AskUserQuestion tools — no Bash, no Read, no Write, no git, no gh
- Subagent prompts include ALL needed context — subagents do NOT see auto memory or conversation history
- GitHub project/board IDs: ALWAYS use values from the "GitHub Context" section — NEVER guess or hallucinate IDs
- Copilot agents (copilot-plan-reviewer, copilot-code-reviewer) use `subagent_type: "general-purpose"` — they invoke `copilot` CLI via Bash
- All ensemble reviews use identical input data and identical Read permissions — only the model differs

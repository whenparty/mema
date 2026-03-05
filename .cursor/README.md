# Cursor Agent Architecture

This project uses a structured `.cursor` setup for predictable delivery quality.

## Required Agent Set

- `planner-a` (implementation-focused)
- `planner-b` (correctness/resilience-focused)
- `planner-c` (adversarial/runtime-focused — prompts, schemas, LLM contracts)
- `design-reviewer` (also writes `.task/selected-plan.md` for HYBRID verdicts)
- `plan-verifier`
- `implementer-core` (business/domain implementation specialist)
- `implementer-test` (unit-test and fix-forward specialist)
- `implementer-e2e` (e2e scenario authoring specialist)
- `docker-e2e-runner`
- `compliance-checker` (independent workflow compliance gate)
- `github-agent`
- `code-reviewer-a`
- `code-reviewer-b`

## Pre-Planning Agents

- `context-builder-product` (mandatory; extracts product/spec context before planning)
- `context-builder-tech` (mandatory; extracts code/architecture context before planning)
- `research` (invoked by planner-a/planner-b/planner-c when needed; not a separate pipeline step)

## Mandatory Quality Gates

- Parallel planning and design decision are required:
  - run `planner-a`, `planner-b`, and `planner-c` in parallel (all read `.task/context-product.md` + `.task/context-tech.md`)
  - run `design-reviewer` (reads `.task/plan-a.md` + `.task/plan-b.md` + `.task/plan-c.md`) — writes `.task/selected-plan.md`
  - run `plan-verifier` on `.task/selected-plan.md` (substance check, not format-only)
- Ensemble code review is required:
  - run `code-reviewer-a` and `code-reviewer-b` in parallel on identical inputs
  - A and B must use different models
  - both must include DA adherence checklist
- Model integrity: gate agents (`design-reviewer`, `plan-verifier`, `code-reviewer-a`, `code-reviewer-b`, `compliance-checker`) must NEVER be invoked with `model: "fast"` — use the model from `.cursor/agents/<name>.md`
- E2E gate is required:
  - run `implementer-core` -> `implementer-test` -> `implementer-e2e`
  - `docker-e2e-runner` executes local Docker-based e2e checks
  - e2e preflight must verify DB reachability from test process, not only container health
  - use canonical package scripts (`test:unit`, `test:e2e`, `test:e2e:single`)
- GitHub lifecycle is required:
  - `github-agent` reads task/issue, updates status, creates PR, and finalizes lifecycle actions
- Independent compliance gate is required:
  - run `compliance-checker` after all execution gates and before finalizing lifecycle actions
  - `compliance-checker` must run `tools/check-strict-workflow.sh .task`
  - final checklist is copied from `.task/compliance-report.md`, never self-authored by orchestrator
- Gate todo state tracks verdict: `in_progress` until APPROVED/PASS, never `completed` on NEEDS_REVISION/FAIL
- `NEEDS_REPLANNING` is a legal verdict and mandatory when root cause is architectural/contextual (not fixable with local code edits)

## Feedback Loops on Gate FAIL

- `design-reviewer` FAIL/NEEDS_REWORK: return to `planner-a/b/c` with must-fix items, regenerate plans, then re-run design review.
- `plan-verifier` FAIL: return to selected planner output and/or design review merge plan, then re-run `plan-verifier`.
- `code-reviewer-a/b` NEEDS_REVISION: triage root cause first. If implementation-only, return to the owning implementer stage(s) to address ALL must-fix items, re-run tests, then re-run BOTH `code-reviewer-a/b`. If plan/context mismatch, issue `NEEDS_REPLANNING` and trigger controlled re-planning loop.
- `docker-e2e-runner` FAIL: triage root cause first. If implementation-only, return to the owning implementer stage(s) to fix and re-run. If plan/context mismatch, trigger controlled re-planning loop.
- `compliance-checker` FAIL: return to the owning failed step(s), regenerate artifacts/evidence, then re-run `compliance-checker`.
- Max 2 retry cycles per gate. After that, escalate to user with blocker summary.
- Each retry must reference the previous FAIL verdict and describe what was changed.

### Controlled Re-planning Loop

Use this loop only when failure evidence shows the approved plan is not viable against real code/runtime constraints.

1. Create `.task/replan-request.md` with:
   - failing evidence (commands/files/findings),
   - root-cause classification (`plan` | `context`),
   - what must change in the plan.
2. Append re-planning evidence summary to `.task/context-tech.md` and/or `.task/context-product.md`, and reference `.task/replan-request.md`.
3. Re-run `planner-a/b/c` -> `design-reviewer` -> `plan-verifier`.
4. Resume `implementer-core` -> `implementer-test` -> `implementer-e2e` on the newly approved `.task/selected-plan.md`.

Limit: at most one re-planning loop per task unless user approves another loop.

## Development Plan Quality Baseline (Hard Gate for all tasks)

Use the approved task development plan as the reference quality bar for delivery rigor.

- Acceptance criteria must be explicit with PASS/FAIL per item.
- Edge cases and failure modes must be explicit with PASS/FAIL per item.
- `context-builder-product` and `context-builder-tech` must produce complementary context packets; planners validate and extend both.
- Planner/reviewer/implementer artifacts must include traceability:
  - `Inputs consumed` (files actually read/used)
  - `Evidence map` (claims -> source artifacts)
  - each section has at least 2 bullet items in critical artifacts
- Planner outputs must include an architecture alternatives section:
  - at least two viable options, OR explicit "single viable option" justification tied to constraints
  - trade-off table
  - explicit non-goals/deferred scope
- Planner must include an architecture watch section with constraint impact on the task.
- Planner must check backlog/milestones (`5_1_Backlog.md`, `5_2_Milestones.md`) and include scope boundary.
- Planners must perform independent source spot-checks (not only context packet) and explicitly log context gaps they found/corrected.
- `design-reviewer` must produce a weighted scorecard and explicit verdict (`WINNER_A`, `WINNER_B`, `WINNER_C`, or `HYBRID`) before implementation.
- `plan-verifier` must fail if selected plan does not include `design-reviewer` must-fix items.
- Tests must cover happy path, edge cases, and error paths for changed behavior.
- New failure modes should use typed, actionable errors.
- If a change is part of a public module API, export it from the module barrel where applicable.
- For any `src/<module>/...` code change, review and update `src/<module>/AGENTS.md` when needed.
- For global process/workflow changes, update root `AGENTS.md`.
- Include a `Deviations from Plan` section in final artifacts (or state `None`).
- Final code gate requires two independent reviewer verdicts (A/B pair).
- Final workflow gate requires independent compliance PASS from `compliance-checker`.
- If a known boundary case is not covered by tests, the task is not accepted.
- If docs index or architecture watch is missing, the task is not accepted.
- If deferred backlog work is implemented prematurely, the task is not accepted.
- If e2e evidence lacks DB reachability preflight or uses non-canonical test commands, the task is not accepted.
- Final artifact sections must be ordered: `Summary` -> `Acceptance Criteria` -> `Deviations from Plan` -> `Review Summary`.
- Import policy: use public top-level package imports by default; deep imports require explicit technical reason and inline comment.

## Recommended Workflow

0. Clean/create `.task/` directory and initialize `.task/run-log.md` + `.task/workflow-state.md`
1. `github-agent` intake → write `.task/issue.md`
2. `context-builder-product` (reads `.task/issue.md`) → write `.task/context-product.md`
3. `context-builder-tech` (reads `.task/issue.md`) → write `.task/context-tech.md`
4. `Context Validation` by orchestrator → write `.task/context-validation.md`; re-run owning context-builder if critical gaps are found
5. `planner-a` + `planner-b` + `planner-c` in parallel (all read `.task/context-product.md` + `.task/context-tech.md`) → write `.task/plan-a.md` + `.task/plan-b.md` + `.task/plan-c.md`
6. `design-reviewer` (reads all three plan files) → write `.task/selected-plan.md` + `.task/design-review.md`
7. `plan-verifier` (reads `.task/design-review.md` + `.task/selected-plan.md`) → write `.task/plan-verification.md`
8. `implementer-core` → write `.task/implementer-core.md`
9. `implementer-test` → write `.task/implementer-test.md`
10. `implementer-e2e` → write `.task/implementer-e2e.md`
11. `docker-e2e-runner` → write `.task/e2e-report.md`
12. `code-reviewer-a` (read `.task/selected-plan.md` + changed files) → write `.task/review-a.md`
13. `code-reviewer-b` (read `.task/selected-plan.md` + changed files) → write `.task/review-b.md`
14. `compliance-checker` (reads `.task/*` + runs `tools/check-strict-workflow.sh .task`) → write `.task/compliance-report.md`
15. `github-agent`: update status, create PR/finalize

Orchestrator role: invoke agents, write their raw output to `.task/` files, pass file paths to next agent, append step evidence to `.task/run-log.md` + `.task/workflow-state.md`, and route risk signals (contradictions, failing checks, unresolved assumptions) as explicit evidence references. It may include a brief `Orchestrator Note` (max 3 sentences) for critical constraints/edge cases/user focus. Never inline or rephrase artifacts in prompts.

Context Validation (4) checklist:
- Relevant FR/NFR/spec constraints for task scope exist in `.task/context-product.md`
- `AGENTS.md` dependency/boundary/runtime constraints are represented in `.task/context-tech.md`
- Critical issue dependencies from `.task/issue.md` are represented in at least one context artifact
- For LLM-facing tasks (intent/routing/classification/generation), relevant `prompts/*.ftl` clauses are represented in context artifacts
- If gaps exist, orchestrator requests a targeted missing-piece retry from the owning context-builder and reruns validation

## Rules

Project rules are in `.cursor/rules/`:
- `architecture-boundaries.mdc`
- `testing-conventions.mdc`
- `task-workflow.mdc`

Use repository `AGENTS.md` as the source of truth for architecture constraints and conventions.

## Commands

Project commands are in `.cursor/commands/`:
- `strict-readme-workflow.md` — enforce full end-to-end execution against this README with mandatory gate artifacts and final PASS/FAIL compliance checklist

## Adopted Memory Rules

These persistent rules were adopted from prior workflow learnings and normalized for this repository.

- All agent artifacts go through `.task/` files — orchestrator writes raw output, downstream agents read from files. Orchestrator never inlines artifact content into prompts.
- Artifact presence alone is insufficient; required artifacts must include traceability sections (`Inputs consumed`, `Evidence map`) for critical gates, with minimum 2 entries per section.
- Orchestrator prompts to agents are minimal: task ID + input file paths. Agents have their own instructions.
- Minimal prompt does not mean blind relay: orchestrator must pass explicit risk signals with artifact references when gates fail or assumptions break.
- Explicitly constrain subagent output scope (target files/dirs) to prevent out-of-scope edits.
- Never downgrade gate agent models with `model: "fast"` at call site; always use the model from `.cursor/agents/`.
- For P0 or architecture-significant tasks, always run tri-planning (`planner-a/b/c`) and design review before coding.
- Before concluding, report what was actually checked (files/commands/evidence).
- Do not assume external environment details (VPS/network/shared infra) without verification.
- For GitHub lifecycle operations, chain dependent commands to avoid race conditions (e.g., push then PR creation).
- Use only canonical package scripts from `package.json`; avoid undocumented aliases.
- When unsetting environment variables in Node/Bun tests, use `delete process.env.X` (not `process.env.X = undefined`).
- Treat `docs/decisions/` as technology source of truth; do not rely on `spikes/` paths during implementation.
- Orchestrator must not micromanage context-builders with file lists or section hints. Pass only the task description and let each agent apply its own extraction rules. Exception: targeted missing-piece retry after failed Context Validation (4).
- Design-reviewer must verify DA mutual implementability: if DA-X promises an artifact and DA-Y constrains where it can live, the resolution must be explicit. Unresolved tensions between DAs cascade into missing artifacts.
- Code reviewers must enumerate each DA from the approved plan and check delivered/missing/partial. Reviewing code "as-is" without cross-referencing the DA list misses dropped commitments.
- Final workflow compliance must come from independent `compliance-checker` output (`.task/compliance-report.md`), not orchestrator self-report.

# Strict README Workflow

Run this task in strict execution mode using `@.cursor/README.md` as the process contract.
Use the approved development plan as the quality reference standard for delivery rigor.

## Required behavior

- Execute all workflow steps in order from `@.cursor/README.md`.
- Do not skip mandatory gates.
- Do not move to the next step without artifacts from the previous one.
- Every numbered workflow step must be executed as a subagent invocation with the correct `subagent_type`. The orchestrating agent reading files or gathering context itself does NOT replace running the designated subagent (e.g., manually reading specs does not replace `context-builder-product` and `context-builder-tech`).
- Orchestrator prompts to `context-builder-product`, `context-builder-tech`, and all other subagents MUST include a high-level semantic summary of the user's core intent, current task state, and important conversational context. Do not rely solely on file paths.
- The orchestrator acts as the "semantic bridge": explicitly pass the user's goals, implicit nuances, and explicit risk signals into the subagent prompt so they understand the *why*.
- **WARNING**: Do NOT narrow the subagent's scope, limit its execution, or prescribe *how* it should perform its task. The semantic summary is ONLY for providing high-level intent and context. The subagent must still read the full artifacts to make its own decisions based on its defined role.
- `NEEDS_REPLANNING` is a legal verdict when the selected architecture is fundamentally flawed, technically impossible, or violates constraints discovered during implementation/review.
- If a gate fails, follow the defined feedback loop (see README) to retry up to 2 times.
- After 2 failed retries, stop and escalate to user with blocker summary and concrete next action.
- Treat this command as hard-gate enforcement, not guidance.
- Follow the approved plan meticulously; untracked deviations are not allowed.
- Initialize and maintain `.task/run-log.md` and `.task/workflow-state.md` during execution; these are mandatory evidence for compliance.
- For planner/reviewer/implementer artifacts, require explicit traceability sections:
  - `Inputs consumed` (which files were actually read and used)
  - `Evidence map` (which claim maps to which source artifact)
  - each section must contain at least 2 bullet items for critical artifacts

## Development-plan quality standard (hard gate)

- Acceptance criteria must be explicitly listed and marked pass/fail.
- Edge cases and failure modes must be explicitly listed and marked pass/fail.
- Planner outputs must include docs index snapshot (`docs/specification/` and `docs/decisions/`) and architecture watch.
- Planner outputs must include architecture alternatives:
  - at least two options, OR explicit single-option justification tied to constraints
  - trade-off table
  - explicit non-goals/deferred scope
- Planner output must include backlog alignment and scope boundary:
  - check `docs/specification/5_1_Backlog.md` and `5_2_Milestones.md`
  - separate `In-scope now` and `Deferred to future tasks`
- Each planner must perform independent source spot-checks and explicitly report context gaps/corrections (to reduce context intake SPOF risk).
- `design-reviewer` output must include weighted scorecard and verdict (`WINNER_A`, `WINNER_B`, `WINNER_C`, or `HYBRID`) before implementation.
- `plan-verifier` must fail if selected plan does not include unresolved must-fix items from design review.
- New failure modes must use typed, actionable errors (avoid generic Error where domain error is appropriate).
- Public API surface changes must be exported from the correct barrel when relevant.
- Tests must be comprehensive for the changed behavior:
  - include happy path, edge cases, and error paths
  - for core utility modules, target deep coverage expected by the current task plan
- For any `src/<module>/...` code change, review and update `src/<module>/AGENTS.md` when needed.
- For global process/workflow changes, update root `AGENTS.md`.
- Include `Deviations from Plan` section; if non-empty, each deviation needs reason + impact.
- Final review gate must include two independent approvals (A/B reviewers) or explicit blocking findings.
- If a known boundary case is discussed in review and not covered by tests, verdict must be FAIL/NEEDS_REVISION.
- If deferred backlog items are implemented without explicit approval, verdict must be FAIL/NEEDS_REVISION.

## Mandatory gates

1. `github-agent` intake — produce `.task/issue.md`
2. `context-builder-product` subagent invocation (not self-substituted by orchestrating agent)
3. `context-builder-tech` subagent invocation (not self-substituted by orchestrating agent)
4. `Context Validation` by orchestrator — review `.task/context-product.md` + `.task/context-tech.md` for missing critical specs/dependencies; if missing, re-run the owning context-builder with targeted missing-piece request
5. `planner-a`, `planner-b`, and `planner-c` in parallel on identical dual inputs (`.task/context-product.md` + `.task/context-tech.md`)
6. `design-reviewer` decision gate — reads all three plan files, writes `.task/selected-plan.md`
7. `plan-verifier` hard gate on `.task/selected-plan.md` (substance check, not format-only)
8. `implementer-core` — business/domain implementation only
9. `implementer-test` — write/run unit tests, fix core code until unit checks pass
10. `implementer-e2e` — author e2e scenarios from ACs
11. `docker-e2e-runner` local Docker e2e execution with PASS/FAIL evidence
12. `code-reviewer-a` — includes DA adherence checklist
13. `code-reviewer-b` — includes DA adherence checklist
14. `compliance-checker` independent gate — runs `tools/check-strict-workflow.sh .task`, validates all artifacts, and writes `.task/compliance-report.md`
15. `github-agent` lifecycle actions (status/PR/finalization as requested)

## File-based artifact handoff

- Orchestrator cleans and creates `.task/` at workflow start (`rm -rf .task && mkdir .task && touch .task/run-log.md .task/workflow-state.md`).
- Write-capable agents write their own artifact to `.task/<step>.md` directly. Readonly agents (code-reviewer-a/b) return text; orchestrator writes it verbatim. Orchestrator verifies file existence after each agent returns.
- Downstream agents read full artifacts from `.task/` files. The orchestrator must NEVER inline or copy-paste the contents of these artifact files into the subagent prompt. Instead, the orchestrator MUST provide exact file paths to the artifacts.
- Orchestrator prompts MUST contain: Task ID, Input file paths, **Core Intent Summary**, **Key Decisions/Nuances from History**, and **Specific Instructions**.
- Do not use empty or minimal prompts. A subagent starts with a blank context window; you are responsible for onboarding it to the task semantics.
- Orchestrator appends one line per executed step to `.task/run-log.md` with format: `- STEP N: <agent>`.
- Orchestrator MUST include a detailed `Orchestrator Note` conveying the relevant conversation history, intent, and high-level goals that won't be obvious from the raw artifact files alone. This note MUST NOT replace the artifact files.
- Presence of artifact files is not enough: downstream artifacts must prove usage via `Inputs consumed` + `Evidence map` with non-empty detail (minimum 2 bullet items per section).

## Step 4 Context Validation (mandatory)

After both context-builders and before planners, orchestrator must validate `.task/context-product.md` + `.task/context-tech.md` for:

1. Product coverage: relevant FR/NFR/AC/spec content in `.task/context-product.md`.
2. Technical coverage: dependency, boundary, and runtime/code constraints in `.task/context-tech.md`.
3. Any critical issue/dependency info from `.task/issue.md` that is missing in either packet.
4. Prompt coverage for LLM-facing tasks: if task touches intent/routing/classification/generation, relevant `prompts/*.ftl` clauses are referenced in at least one context artifact (prefer both, from product and technical angles).

If critical gaps are found:
- Write `.task/context-validation.md` with missing items and evidence.
- Re-run the owning context-builder (`context-builder-product` or `context-builder-tech`) with specific missing-piece instructions.
- Re-run Context Validation before proceeding to planners.

## Controlled Re-planning Loop (mandatory on plan/context mismatch)

When implementation/e2e/review evidence shows the selected plan is not viable:

1. Create `.task/replan-request.md` with:
   - failing evidence references (commands/files/findings),
   - root-cause classification (`plan` or `context`),
   - required plan changes.
2. Append re-planning evidence summary to the relevant context artifact(s) (`.task/context-tech.md` and/or `.task/context-product.md`) with link to `.task/replan-request.md`.
3. Restart from Step 5 (`planner-a/b/c`) using updated context packet.
4. Re-run `design-reviewer` -> `plan-verifier`.
5. Resume implementation stages (`implementer-core` -> `implementer-test` -> `implementer-e2e`) on refreshed `.task/selected-plan.md`.

Rules:
- This loop is required for architectural dead-ends; do not force implementer to patch around a broken plan.
- Limit to one loop per task unless user explicitly approves additional loops.

## Model integrity

- Gate agents (`design-reviewer`, `plan-verifier`, `code-reviewer-a`, `code-reviewer-b`, `compliance-checker`) must NEVER be invoked with `model: "fast"` or any model override
- Each agent's model is defined in `.cursor/agents/<name>.md` and must not be downgraded at call site
- Violating model integrity invalidates the gate verdict

## Gate verdict enforcement

- A gate is PASS only when the required verdict is achieved:
  - `design-reviewer`: verdict is WINNER_A, WINNER_B, WINNER_C, or HYBRID (not NEEDS_REWORK)
  - `plan-verifier`: verdict is PASS (not FAIL)
  - implementation stages: `implementer-core`/`implementer-test`/`implementer-e2e` completed with artifacts and no blocking verdict
  - `code-reviewer-a` AND `code-reviewer-b`: both verdicts are APPROVED (not NEEDS_REVISION or FAILED)
  - `docker-e2e-runner`: all tests pass
  - `compliance-checker`: verdict is PASS (not FAIL)
- `NEEDS_REPLANNING` enforcement:
  - If `implementer-core`/`implementer-test`/`implementer-e2e` or `code-reviewer-a/b` determines selected architecture is fundamentally flawed, technically impossible, or constraint-violating, they must issue `NEEDS_REPLANNING`.
  - Orchestrator must append failure evidence to the relevant context artifact(s) (with `.task/replan-request.md` reference) and restart from Step 5 (Parallel Planners).
- After a NEEDS_REVISION verdict from code-reviewer-a/b:
  1. Triage root cause (`implementation` vs `plan/context mismatch`)
  2. If `implementation`: return to owning implementer stage(s) to fix all must-fix items, re-run unit/e2e, then re-run BOTH reviewers
  3. If `plan/context mismatch`: run Controlled Re-planning Loop before returning to implementation
  4. Run `compliance-checker` after reviewers return APPROVED
  5. Only proceed to github-agent when compliance-checker returns PASS
- After a FAIL from `docker-e2e-runner`:
  1. Triage root cause (`implementation` vs `plan/context mismatch`)
  2. If `implementation`: fix in owning implementer stage(s), re-run e2e
  3. If `plan/context mismatch`: run Controlled Re-planning Loop
- Do not mark a gate todo as completed until the gate verdict requirement is met
- Skipping a re-review after NEEDS_REVISION is a workflow violation

## E2E preflight requirements

- Validate canonical test command usage from `package.json` (`test:unit`, `test:e2e`, `test:e2e:single`).
- Validate `DATABASE_URL` points to a host-reachable DB from the test process.
- Validate Docker service health and DB reachability separately.
- If task touches timezone-sensitive logic, include `TZ` evidence in runner report.

## Artifact requirements per step

| Step | File | Content |
|---|---|---|
| github-agent intake | `.task/issue.md` | Issue body, dependency status, blockers, git state |
| context-builder-product | `.task/context-product.md` | Product/spec packet with verbatim FR/NFR/AC/docs extraction |
| context-builder-tech | `.task/context-tech.md` | Code/architecture packet with decisions, constraints, interfaces |
| context validation (4) | `.task/context-validation.md` | Missing critical docs/dependencies check + rerun decision |
| planner-a | `.task/plan-a.md` | Implementation-focused plan with docs index, architecture watch, DAs, AC mapping |
| planner-b | `.task/plan-b.md` | Correctness/resilience-focused plan |
| planner-c | `.task/plan-c.md` | Adversarial/runtime-focused plan with prompt content requirements and schema contracts |
| design-reviewer | `.task/design-review.md` | Scorecard, verdict, must-keep, must-fix, constraint audit |
| plan-verifier | `.task/plan-verification.md` | PASS/FAIL with gate checks and implementation handoff |
| implementer-core (8) | `.task/implementer-core.md` | Business/domain code changes + focused checks |
| implementer-test (9) | `.task/implementer-test.md` | Unit tests + fix-forward evidence |
| implementer-e2e (10) | `.task/implementer-e2e.md` | E2E scenarios derived from AC |
| docker-e2e-runner | `.task/e2e-report.md` | E2E run evidence with PASS/FAIL |
| code-reviewer-a | `.task/review-a.md` | Severity-ordered findings, verdict, DA adherence checklist |
| code-reviewer-b | `.task/review-b.md` | Severity-ordered findings, verdict, DA adherence checklist |
| compliance-checker | `.task/compliance-report.md` | Independent checklist + blocker evidence + next actions |
| orchestrator evidence | `.task/run-log.md`, `.task/workflow-state.md` | Step invocation order and gate status transitions |
| optional replan trigger | `.task/replan-request.md` | Evidence-backed request to re-run planning when plan/context is invalid |

## Final response contract

Return the `README compliance checklist` copied from `.task/compliance-report.md` (do not self-author) with PASS/FAIL for:

- Required Agent Set used
- Planning decision gate
- E2E gate
- Ensemble review gate
- GitHub lifecycle gate
- Development-plan quality standard

Then include:

- Remaining blockers (if any)
- Exact next command the user should run or approve
- Explicit AC checklist with PASS/FAIL per AC
- Explicit edge-case checklist with PASS/FAIL per case
- `Deviations from Plan` section

## Escalation format (required after max retries or compliance FAIL)

When escalating to user, include exactly:

1. `Blocker summary` (1-3 bullets)
2. `Evidence` (failed file/check references)
3. `Why blocked now` (what gate cannot be passed)
4. `Next action options` (2 concrete options with command/approval needed)

## Required artifact section format

Every strict workflow final artifact must contain these sections in order:

1. `Summary`
2. `Acceptance Criteria`
3. `Deviations from Plan`
4. `Review Summary`

Rules:
- `Acceptance Criteria` must include PASS/FAIL per criterion.
- If there are no deviations, write `Deviations from Plan: None`.
- `Review Summary` must include both reviewer verdicts (A/B) and key must-fix outcomes.

## Optional input after command

If user passes extra text after the command, treat it as task context and append it to the workflow input.

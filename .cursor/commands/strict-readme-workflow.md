# Strict Workflow

This file is the single source of truth for workflow orchestration in `.cursor/`.
Use the approved plan as the delivery quality bar, and use repository `AGENTS.md`
as the source of truth for architecture, dependency rules, and runtime constraints.

## Source Of Truth Split

- `AGENTS.md` — repository architecture, constraints, conventions
- `.cursor/commands/strict-readme-workflow.md` — workflow orchestration, gates, retries, prompt policy
- `.cursor/artifact-contracts.md` — `.task/` artifact schemas and merge semantics
- `.cursor/agents/*.md` — per-agent role prompts and output contracts
- `tools/check-strict-workflow.sh` — deterministic validation of the strict workflow

## Required Agent Set

### Context builders

- `context-builder-product` — builds the product/source index before planning
- `context-builder-tech` — builds the technical/source index before planning

### Planning pipeline

- `problem-analyst` — INTAKE, PROBLEM FRAMING, product REQUIREMENT SHAPING
- `solution-architect` — tech REQUIREMENT SHAPING, OPTION GENERATION, DESIGN CONSOLIDATION
- `critic` — CHALLENGE REVIEW
- `delivery-planner` — DELIVERY SLICING
- `spec-writer` — DETAIL SPEC
- `plan-verifier` — hard gate on the selected plan
- `spec-verifier` — hard gate on the implementation spec

### Working groups

- `test-strategist`
- `codebase-analyst`
- `doc-reviewer`
- `research`

### Implementation

- `implementer-test`
- `implementer-core`
- `implementer-integration`
- `integration-runner`

### Review and compliance

- `code-reviewer-a`
- `code-reviewer-b`
- `compliance-checker`

Compliance note:

- The first deterministic compliance pass MUST NOT require the newly generated
  `.task/compliance-report.md` to already contain `value: PASS`.
- If the orchestrator wants a second deterministic confirmation after writing the
  artifact, it may run `tools/check-strict-workflow.sh .task --post --json`.

### Skills

- `github-ops` — issue intake, branch/board updates, PR lifecycle

## Runtime Invocation Compatibility

Repo-defined agent names in `.cursor/agents/*.md` are **conceptual workflow
roles** and prompt contracts. They are not guaranteed to exist as literal
runtime `subagent_type` values in every environment.

### Invocation model

- The orchestrator MUST execute every named workflow role via a subagent
  invocation.
- If a dedicated runtime `subagent_type` exists for that role, it may be used.
- If a dedicated runtime type does not exist, the orchestrator MUST use a
  supported generic wrapper and pass the corresponding
  `.cursor/agents/<name>.md` file as the role contract to read first.

### Preferred runtime wrappers

- `explore` — context builders and broad repository investigation
- `generalPurpose` — all other repo-defined workflow roles
- `shell` — command-execution specialists only
- `orchestrator` — skill-owned or direct orchestrator steps (for logging only)

### Minimal wrapper mapping

- `context-builder-product` -> `explore`
- `context-builder-tech` -> `explore`
- every other repo-defined workflow role -> `generalPurpose`
- skill-owned steps like issue intake and board/branch updates -> `orchestrator`

### Required role handoff

- When invoking a repo-defined role through a generic wrapper, the orchestrator
  MUST:
  - pass the role prompt file path
  - instruct the subagent to read that file first
  - require the subagent to follow that file as the role/output contract
- "Required Agent Set used" means the conceptual role set was executed, not that
  the literal role name appeared as the runtime `subagent_type` enum.

## Core Execution Principles

- Execute workflow steps in the canonical order defined below.
- Do not skip mandatory gates or advance without artifacts from the prior step.
- Every numbered workflow step that names an agent MUST be executed as a
  subagent invocation for that conceptual role, using the runtime compatibility
  rules above.
- Workflow is **artifact-first**: downstream agents start from `.task/` artifacts, not from copied prompt summaries.
- Context indexes are for navigation, not for blocking source access: **index is navigation, not a firewall**.
- Downstream agents MUST read relevant raw sources referenced by upstream artifacts before making claims about behavior, constraints, or architecture.
- Silent reconciliation is forbidden: if an agent finds omitted or contradictory source truth, it MUST raise an explicit flag instead of silently overriding an approved artifact.
- Some tasks may declare a **planning bundle**. Planning bundles widen architecture context, not implementation scope.
- When a planning bundle is declared, agents MUST plan with the linked tasks in mind, but implementation must remain bounded to `implement_now` unless the approved plan explicitly widens scope.
- Investigation happens before design, design before spec, spec before code.
- Initialize and maintain `.task/run-log.md`, `.task/workflow-state.md`, and `.task/working-group-findings.md` during execution.
- Initialize and maintain `.task/planning-source-audit.md` during planning.
- Gate failures must follow the feedback loops defined in this file. Stop after 2 failed retries and escalate to the user.

## Semantic Fidelity Policy

### Required flag types

- `MISSED_SOURCE` — a required raw source was not included or not carried forward
- `DISTILLATION_GAP` — a source was indexed but its important meaning was not preserved in downstream artifacts
- `SOURCE_CONTRADICTION` — a downstream artifact contradicts a raw source
- `SPEC_GAP` — the plan/spec is too underspecified to execute without guessing
- `NEEDS_REPLANNING` — the approved plan/design is no longer viable

### Required behavior

- `context-product.md` and `context-tech.md` provide `ref` and `source_id` anchors. They do not replace the raw sources.
- If `.task/issue.md` declares a planning bundle, context builders and planning agents MUST treat linked tasks as architecture context and source-discovery context.
- Planning-bundle awareness is not scope creep by itself. It is required context for design decisions that cross task boundaries.
- Planning pipeline agents MUST read the raw sources referenced in those context packets before writing `planning-context.md`.
- Delivery, spec, implementation, review, and compliance agents MUST read the relevant raw sources referenced by upstream artifacts and `source_id` values before making substantive claims.
- Raw source reading augments downstream work. It does **not** grant permission to silently bypass or redesign the approved artifacts.
- If a raw source conflicts with an approved artifact, the agent MUST surface the conflict via findings, `Spec Gaps`, deviations, or `NEEDS_REPLANNING`.
- Every raw source actually used must appear in both `Inputs Consumed` and `Evidence Map` in the agent output when those sections are required.

## Refactor Policy

- `micro-refactor` — local cleanup inside the touched step/module; may be handled by implementers with explicit documentation
- `planned refactor` — refactor required by the approved design; must be chosen during planning and appear in `selected-plan.md`
- `architectural refactor` — changes module ownership, dependency flow, or major boundaries; if discovered late, raise `NEEDS_REPLANNING`

## Development-Plan Quality Standard

- Planning outputs must include explicit acceptance criteria, edge cases, deferred scope, and risks.
- Planning outputs must include design axes for each architecture-significant question, with 2-3 options or a single-option justification tied to constraints.
- `selected-plan.md` must include docs index snapshot, architecture watch, design decisions, AC coverage, edge cases, risks, and scope boundary.
- `implementation-spec.md` must preserve step-level traceability from selected-plan steps, ACs, and `source_id` values.
- Critical artifacts must include non-empty `Inputs Consumed` and `Evidence Map` sections.
- Planning pipeline phases must emit `Inputs Consumed` and the orchestrator must
  persist them into `.task/planning-source-audit.md`.
- If working groups were used, their findings must be persisted and then consumed by later stages.
- Deferred backlog/scope items must stay deferred unless a new plan explicitly approves them.
- For any `src/<module>/...` code change, review and update the corresponding `src/<module>/AGENTS.md` when needed.
- For repository architecture or workflow-agnostic constraint changes, update root `AGENTS.md`.

## Mandatory Workflow Steps

Use these exact step labels in `.task/run-log.md`:

1. `STEP 1: issue intake`
2. `STEP 2: context-builder-product`
3. `STEP 3: context-builder-tech`
4. `STEP 4a: problem-analyst intake`
5. `STEP 4b: problem-analyst problem-framing`
6. `STEP 5a: requirement-shaping`
7. `STEP 5b: option-generation`
8. `STEP 5c: design-consolidation`
9. `STEP 6a: critic challenge-review`
10. `STEP 6b: delivery-planner`
11. `STEP 6c: spec-writer`
12. `STEP 7a: plan-verifier`
13. `STEP 7b: spec-verifier`
14. `STEP 8: github-ops branch`
15. `STEP 9: implementer-test`
16. `STEP 10: implementer-core`
17. `STEP 11: implementer-integration`
18. `STEP 12: integration-runner`
19. `STEP 13: code-reviewer-a`
20. `STEP 13: code-reviewer-b`
21. `STEP 14: compliance-checker`

### Step descriptions

1. Read the issue using `github-ops` and write `.task/issue.md`
2. Run `context-builder-product` and write `.task/context-product.md`
3. Run `context-builder-tech` and write `.task/context-tech.md`
4. Run `problem-analyst` INTAKE and merge the patch into `.task/planning-context.md`
5. Run `problem-analyst` PROBLEM FRAMING and merge the patch
6. Run `problem-analyst` REQUIREMENT SHAPING (product side), then `solution-architect` REQUIREMENT SHAPING (tech side)
7. Run `solution-architect` OPTION GENERATION
8. Run `solution-architect` DESIGN CONSOLIDATION
9. Run `critic` CHALLENGE REVIEW
10. Run `delivery-planner`
11. Run `spec-writer`
12. Run `plan-verifier`
13. Run `spec-verifier`
14. Create/update branch and board state using `github-ops`
15. Run `implementer-test`
16. Run `implementer-core`
17. Run `implementer-integration`
18. Run `integration-runner`
19. Run `code-reviewer-a`
20. Run `code-reviewer-b`
21. Run `compliance-checker`

## File-Based Artifact Handoff

- Orchestrator initializes `.task/` at workflow start and creates:
  - `.task/run-log.md`
  - `.task/workflow-state.md`
  - `.task/working-group-findings.md`
  - `.task/planning-source-audit.md`
- All `.task/*.md` artifacts are written by the orchestrator, not by subagents directly.
- `.task/*.md` artifacts MUST follow `.cursor/artifact-contracts.md`.
- `.task/*.md` artifacts are workflow state files. The orchestrator MUST NOT use `ApplyPatch` to write or update any `.task/*.md` artifact.
- The orchestrator MUST persist `.task/*.md` artifacts using direct file I/O only, via shell heredoc overwrite/append (for example `cat <<'EOF' > file`) or Python file writes.
- This write-safety rule applies especially to high-churn artifacts and append/merge artifacts:
  - `.task/planning-context.md`
  - `.task/planning-source-audit.md`
  - `.task/working-group-findings.md`
  - `.task/run-log.md`
  - `.task/workflow-state.md`
  - `.task/issue.md`
- Passthrough artifact agents (`context-builder-*`, `delivery-planner`, `spec-writer`, `plan-verifier`, `spec-verifier`, `code-reviewer-a`, `code-reviewer-b`, `compliance-checker`) return complete artifact text. The orchestrator writes it verbatim.
- Code-writing agents (`implementer-test`, `implementer-core`, `implementer-integration`, `integration-runner`) edit the codebase and return a delimited report. The orchestrator extracts and writes the report.
- Planning pipeline agents (`problem-analyst`, `solution-architect`, `critic`) return `# Planning Context Patch` artifacts. The orchestrator merges sections according to `replace_sections` and `append_sections`, appends `## Decision Log`, and treats `## Verdict` / `## Findings` as control sections.
- For planning pipeline agents, the orchestrator MUST also extract the patch
  `## Inputs Consumed` control section and append it to
  `.task/planning-source-audit.md` under `## <agent> — <phase>`.
- Append-only `.task` artifacts (`planning-source-audit.md`, `working-group-findings.md`, and append-only sections inside merged planning artifacts) MUST be updated through the same direct file I/O path and MUST NOT rely on patch-style append behavior.
- The orchestrator MUST NOT inline `.task` artifact bodies into downstream prompts.
- The orchestrator MUST NOT summarize, rewrite, or filter agent output when writing `.task` artifacts.
- After writing an artifact, verify that the file exists and is non-empty.
- If an agent response is truncated, resume the agent before writing the artifact.
- Record the actual `runtime_wrapper` used for each workflow step in
  `.task/workflow-state.md`. Use:
  - `explore`
  - `generalPurpose`
  - `shell`
  - `orchestrator`

## Orchestrator Prompt Policy

Every orchestrator prompt to a subagent MUST include:

1. Task ID
2. Input file paths
3. Core Intent Summary
4. Key Decisions/Nuances from History
5. Specific Instructions

Additional rules:

- Include a 3-5 sentence `Orchestrator Note` that carries conversation context and user intent that are not obvious from artifact files alone.
- Do not rely on file paths alone; carry the semantic why.
- Do not prescribe the agent's implementation details beyond scope, inputs, and must-follow contract rules.
- For planning and downstream agents, explicitly instruct them to read the relevant raw sources referenced by `ref` and `source_id` values before making claims.
- When a prior gate failed, include the previous verdict, must-fix items, and what changed.

## Planning Pipeline

After the context builders, the planning pipeline uses `.task/planning-context.md`
as the shared semantic ledger.

- `problem-analyst` owns product framing, success criteria, and product-side requirements.
- `solution-architect` owns architecture constraints, design axes, options, chosen design, and refactor class.
- If `.task/issue.md` declares a planning bundle, `problem-analyst` and `solution-architect` MUST treat linked tasks as legal planning context for shared architecture seams, command/routing boundaries, state-routing interactions, and future extension points.
- Bundle-aware planning MUST still preserve an explicit `implement_now` boundary. Current-task implementation scope and deferred bundle tasks must remain distinguishable in `selected-plan.md`.
- `solution-architect` MUST investigate current code and reuse patterns before freezing architecture. When needed, invoke:
  - `codebase-analyst` for current code and interface investigation
  - `research` for option/risk comparison
  - `doc-reviewer` for spec/decision consistency checks
  - `test-strategist` for testing axis and failure-mode discovery
- `critic` validates not only the chosen design but also the completeness of design axes, source coverage, and mutual implementability across chosen decisions.
- `critic`, `plan-verifier`, and `compliance-checker` must reason over all
  constraint types present in `planning-context.md`: `product`, `technical`,
  and `decision`.
- Architecture-significant refactors must be explicit by the end of DESIGN CONSOLIDATION. They must not first appear in implementation.

### Working group persistence

- Every working group result MUST be appended to `.task/working-group-findings.md`.
- Each entry MUST identify the working group, invoking agent, phase, and question asked.
- `spec-writer`, implementers, reviewers, and compliance-checker MUST consume `.task/working-group-findings.md` when it is non-empty.

## Controlled Re-planning Loop

Trigger re-planning when implementation, integration, review, or compliance reveals:

- architectural dead-ends
- source contradictions that change scope or design
- missing constraints that invalidate the chosen design
- required architectural refactors not present in the approved plan

### Required steps

1. Create `.task/replan-request.md` with failing evidence, root cause, and required changes.
2. Append re-planning evidence to the relevant context artifact(s) with a reference to `.task/replan-request.md`.
3. Restart from `STEP 5a: requirement-shaping`.
4. Re-run OPTION GENERATION → DESIGN CONSOLIDATION → CHALLENGE REVIEW → DELIVERY SLICING → DETAIL SPEC → `plan-verifier` → `spec-verifier`.
5. Resume implementation on the refreshed plan/spec artifacts.

Rules:

- Re-planning is mandatory for architectural contradictions. Do not patch around a broken plan.
- Limit to one re-planning loop per task unless the user explicitly approves more.

## Gate Verdict Enforcement

- `critic` passes only on `APPROVED`
- `plan-verifier` passes only on `PASS`
- `spec-verifier` passes only on `PASS`
- `implementer-test`, `implementer-core`, and `implementer-integration` pass only when they complete without unresolved blocking flags
- `integration-runner` passes only when lint, typecheck, Docker build/health, unit tests, and integration tests all pass
- `code-reviewer-a` and `code-reviewer-b` must both return `APPROVED`
- `compliance-checker` passes only on `PASS`

### Re-run rules

- After any gate failure, the next owning agent MUST receive:
  - the prior verdict
  - the must-fix items
  - what changed for each item
- If the fix changes code, re-run the relevant tests before re-running the gate.
- Do not mark a gate complete in `.task/workflow-state.md` until the required verdict is achieved.

### `NEEDS_REPLANNING`

Use `NEEDS_REPLANNING` when:

- the architecture is fundamentally flawed
- a raw source contradicts the approved design in a way that changes scope or boundaries
- a late-discovered refactor is architectural rather than local
- meaningful tests or implementation cannot proceed without redesign

## Integration Preflight Requirements

- Use canonical package scripts from `package.json`.
- Validate `DATABASE_URL` and database reachability from the test process.
- Check Docker service health separately from DB reachability.
- If timezone-sensitive logic is involved, include `TZ` evidence in the integration report.

## Artifact Requirements Per Step

| Step | Artifact |
|---|---|
| 1 | `.task/issue.md` |
| 2 | `.task/context-product.md` |
| 3 | `.task/context-tech.md` |
| 4a-6a | `.task/planning-context.md` |
| 6b | `.task/selected-plan.md` |
| 6c | `.task/implementation-spec.md` |
| 7a | `.task/plan-verification.md` |
| 7b | `.task/spec-verification.md` |
| 9 | `.task/implementer-test.md` |
| 10 | `.task/implementer-core.md` |
| 11 | `.task/implementer-integration.md` |
| 12 | `.task/integration-report.md` |
| 13 | `.task/review-a.md`, `.task/review-b.md` |
| 14 | `.task/compliance-report.md` |
| all | `.task/run-log.md`, `.task/workflow-state.md`, `.task/working-group-findings.md`, `.task/planning-source-audit.md` |

Issue intake expectations:

- `planning_bundle` is optional metadata in `.task/issue.md`. Use `None` when the task is self-contained.
- When present, `planning_bundle` lists the related `TASK-*` items that must be planned together.
- `implement_now` identifies the current task whose implementation scope remains active.

## Final Response Contract

Return the workflow compliance checklist copied from `.task/compliance-report.md`,
then include:

- remaining blockers, if any
- exact next command or approval needed
- explicit AC checklist with PASS/FAIL
- explicit edge-case checklist with PASS/FAIL
- `Deviations from Plan`

## Escalation Format

After max retries or on compliance failure, include exactly:

1. `Blocker summary`
2. `Evidence`
3. `Why blocked now`
4. `Next action options`

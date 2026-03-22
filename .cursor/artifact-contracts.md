# Artifact Contracts

Strict markdown-first contracts for `.task/` artifacts used by the workflow.

## General Rules

- No freeform preamble before the first heading.
- Use the exact heading names defined below.
- Top-level artifact titles are always `# ...`.
- Canonical sections use `## ...`.
- Unknown canonical headings are invalid unless explicitly allowed by the contract.
- If a section has no items, write `- None`.
- Reference items use this format:
  - `- source_id: <stable id or None> | ref: \`path:start-end\` | note: <why it matters>`
- Scalar metadata uses this format:
  - `- key: value`
- Stable source identifiers SHOULD use repository-native IDs where available:
  - `FR-*`
  - `NFR-*`
  - `US-*`
  - `TASK-*`
  - `M*`
  - `ADR-*`
  - `CODE-<symbol or module>`
  - `None`

## Merge Rules For Planning Context Patches

- The orchestrator parses patches by canonical `## <Section>` headings.
- `## Patch Metadata` must declare:
  - `replace_sections: <comma-separated canonical sections or None>`
  - `append_sections: <comma-separated canonical sections or None>`
- `replace_sections` are for single-current-state sections only.
- `append_sections` are for accumulating or status-tracked sections only.

### Append-only sections

- `Facts`
- `Assumptions`
- `Unknowns`
- `Requirements`
- `Constraints`
- `Decision Log`

### Replace-only sections

- `Context Metadata`
- `Problem Statement`
- `Success Criteria`
- `Options`
- `Tradeoffs`
- `Chosen Design`
- `Rejected Alternatives`
- `Risks And Mitigations`
- `Phases And Dependencies`

### Additional rules

- `## Verdict` and `## Findings` are control sections. They are not merged into `.task/planning-context.md`.
- `## Inputs Consumed` in a planning patch is a control section. It is not merged
  into `.task/planning-context.md`; the orchestrator persists it to
  `.task/planning-source-audit.md`.
- A section MUST NOT appear in both `replace_sections` and `append_sections`.
- Sections omitted from `## Patch Metadata` are ignored.
- For append-only sections, producers MUST NOT overwrite prior items by reusing the same ID for a different meaning.
- To refine an append-only item, emit a new item and link it with `supersedes`, `resolved_by`, or `status`.

## Issue Packet

File: `.task/issue.md`

```md
# Issue Packet

## Metadata
- task_id: TASK-X.Y
- issue_number: 123
- title: <issue title>
- state: OPEN | CLOSED
- board_item_id: PVTI_...
- dependency_status: ALL_CLOSED | HAS_OPEN_DEPS
- planning_bundle: TASK-X.Y, TASK-A.B | None
- implement_now: TASK-X.Y
- planning_bundle_reason: <shared architecture seam or None>
- source: github

## Raw Issue Body
<<<ISSUE_BODY_START
<verbatim issue body markdown, or `None`>
>>>ISSUE_BODY_END

## Dependencies
- task_id: TASK-X.Y | issue_number: 45 | state: open | relation: blocks
- None

## Git State
- branch: <current branch or `main`>
- base_branch: main
- status_summary: clean | dirty

## Intake Notes
- note: <blocker, ambiguity, or intake note>
- None
```

## Product Context Packet

File: `.task/context-product.md`

```md
# Product Context Packet

## Packet Metadata
- task_id: TASK-X.Y
- packet_type: product
- source_artifact: `.task/issue.md`
- producer: context-builder-product

## Task Framing
- actual_goal: <what user is trying to achieve>
- stated_request: <literal request>

## Acceptance Criteria
- id: AC1 | criterion: <criterion> | success_signal: <observable done signal> | source_id: <US/FR/TASK id or None>
- None

## References
### Product Behavior
- source_id: FR-MEM.1 | ref: `docs/specification/...:start-end` | note: <why it matters>
- None

### Prompt Coverage
- source_id: ADR-003 | ref: `prompts/...:start-end` | note: <why it matters>
- None

### Backlog And Milestone
- source_id: TASK-X.Y | ref: `docs/specification/5_1_Backlog.md:start-end` | note: <task row and dependencies>
- source_id: M1 | ref: `docs/specification/5_2_Milestones.md:start-end` | note: <milestone or DoD relevance>
- None

## Docs Index Snapshot
- read: `docs/specification/...` | reason: <why relevant>
- skipped: `docs/specification/...` | reason: <why not needed>

## Scope Hints
- in_scope_candidate: <item>
- out_of_scope_candidate: <item>
- None
```

## Technical Context Packet

File: `.task/context-tech.md`

```md
# Technical Context Packet

## Packet Metadata
- task_id: TASK-X.Y
- packet_type: tech
- source_artifact: `.task/issue.md`
- producer: context-builder-tech

## Task Framing
- actual_goal: <what user is trying to achieve>
- stated_request: <literal request>

## Architecture Constraints
- source_id: NFR-SEC.1 | ref: `AGENTS.md:start-end` | note: <dependency rule / runtime constraint>
- source_id: CODE-module-boundary | ref: `src/.../AGENTS.md:start-end` | note: <module boundary or convention>
- None

## Decision Docs
- source_id: ADR-006 | ref: `docs/decisions/...:start-end` | note: <relevant decision and impact>
- None

## Key Interfaces And Contracts
- source_id: CODE-FactRepository.save | ref: `src/...:start-end` | note: <interface/type/function and why it matters>
- None

## Existing Implementation
- source_id: CODE-current-flow | ref: `src/...:start-end` | note: <current code, schema, or adjacent behavior>
- None

### Prompt Runtime Contracts
- source_id: ADR-003 | ref: `prompts/...:start-end` | note: <runtime contract, placeholders, or schema coupling>
- None

## Docs Index Snapshot
- read: `docs/decisions/...` | reason: <why relevant>
- skipped: `docs/decisions/...` | reason: <why not needed>
```

## Planning Context

File: `.task/planning-context.md`

```md
# Planning Context

## Context Metadata
- task_id: TASK-X.Y
- current_phase: <latest completed phase>
- critic_verdict: APPROVED | BACK_TO_DESIGN | BACK_TO_PROBLEM | PENDING

## Facts
- id: F1 | statement: <fact> | source_id: <stable id or None> | evidence: `path:start-end`
- None

## Assumptions
- id: A1 | statement: <assumption> | status: open | validated | invalidated | source_id: <stable id or None> | owner: <agent> | supersedes: <id or None>
- None

## Unknowns
- id: U1 | statement: <unknown> | status: open | resolved | deferred | source_id: <stable id or None> | resolved_by: <id or None>
- None

## Problem Statement
- summary: <what is broken or missing>
- affected_party: <who is affected>
- why_it_matters: <why it matters>
- source_ids: <comma-separated stable ids or None>

## Success Criteria
- id: SC1 | criterion: <success criterion> | source_id: <stable id or None>
- None

## Requirements
- id: RQ1 | type: AC | FR | NFR | US | TASK | statement: <requirement> | source_id: <stable id> | derived_from: <id or None>
- None

## Constraints
- id: C1 | type: product | technical | decision | statement: <constraint> | source_id: <stable id>
- None

## Options
### Axis DA1
- question: <design question> | source_ids: <comma-separated stable ids or None>
- option: O1 | approach: <approach> | satisfies: <what it satisfies> | tradeoff: <tradeoff> | risk: <risk> | requires_refactor: none | micro-refactor | planned refactor | architectural refactor | source_ids: <stable ids or None>
- option: O2 | approach: <approach> | satisfies: <what it satisfies> | tradeoff: <tradeoff> | risk: <risk> | requires_refactor: none | micro-refactor | planned refactor | architectural refactor | source_ids: <stable ids or None>

## Tradeoffs
- axis: DA1 | chosen_tradeoff: <tradeoff> | deciding_source_ids: <stable ids or None>
- None

## Chosen Design
- id: DA1 | question: <axis question> | chosen: <approach> | rationale: <why> | source_ids: <stable ids or None> | refactor_class: none | micro-refactor | planned refactor | architectural refactor
- None

## Rejected Alternatives
- id: DA1 | rejected: <alternative> | reason: <why rejected> | source_ids: <stable ids or None>
- None

## Risks And Mitigations
- id: R1 | risk: <risk> | mitigation: <mitigation> | source_id: <stable id or None>
- None

## Phases And Dependencies
- phase: Phase 1 | depends_on: None | purpose: <purpose>
- None

## Decision Log
- [PHASE] <summary of what changed or was decided> | reasoning: <why this choice was made, what alternatives were considered, and why rejected — 1-2 sentences>
- None
```

## Planning Context Patch

Used by `problem-analyst`, `solution-architect`, and `critic`.

```md
# Planning Context Patch

## Patch Metadata
- agent: <agent name>
- phase: <phase name>
- replace_sections: Context Metadata, Problem Statement
- append_sections: Facts, Unknowns

## Context Metadata
- task_id: TASK-X.Y
- current_phase: <phase name>
- critic_verdict: APPROVED | BACK_TO_DESIGN | BACK_TO_PROBLEM | PENDING

## Inputs Consumed
- source_id: <stable id or None> | ref: `path:start-end` | note: <what was actually read>
- None

## Facts
- id: F1 | statement: <fact> | source_id: <stable id or None> | evidence: `path:start-end`
- None

## Unknowns
- id: U1 | statement: <unknown> | status: open | resolved | deferred | source_id: <stable id or None> | resolved_by: <id or None>
- None

## Problem Statement
- summary: <what is broken or missing>
- affected_party: <who is affected>
- why_it_matters: <why it matters>
- source_ids: <comma-separated stable ids or None>

## Decision Log
- [PHASE] <summary> | reasoning: <why — 1-2 sentences>
```

Patches may include any canonical `Planning Context` section listed above, but only if the section is declared in `replace_sections` or `append_sections`.

Critic control sections:

```md
## Verdict
- value: APPROVED | BACK_TO_DESIGN | BACK_TO_PROBLEM

## Findings
- id: CF1 | severity: critical | major | minor | statement: <finding> | source_id: <stable id or None> | evidence: <evidence> | fix: <required fix>
- None
```

## Planning Source Audit

File: `.task/planning-source-audit.md`

```md
# Planning Source Audit

## problem-analyst — INTAKE
- source_id: <stable id or None> | ref: `path:start-end` | note: <what was actually read>
- None

## problem-analyst — PROBLEM FRAMING
- source_id: <stable id or None> | ref: `path:start-end` | note: <what was actually read>
- None

## problem-analyst — REQUIREMENT SHAPING
- source_id: <stable id or None> | ref: `path:start-end` | note: <what was actually read>
- None

## solution-architect — REQUIREMENT SHAPING
- source_id: <stable id or None> | ref: `path:start-end` | note: <what was actually read>
- None

## solution-architect — OPTION GENERATION
- source_id: <stable id or None> | ref: `path:start-end` | note: <what was actually read>
- None

## solution-architect — DESIGN CONSOLIDATION
- source_id: <stable id or None> | ref: `path:start-end` | note: <what was actually read>
- None

## critic — CHALLENGE REVIEW
- source_id: <stable id or None> | ref: `path:start-end` | note: <what was actually read>
- None
```

## Selected Plan

File: `.task/selected-plan.md`

```md
# Selected Plan

## Summary
- summary: <high-level implementation summary>

## Inputs Consumed
- source_id: None | ref: `.task/planning-context.md` | note: <what was used>
- source_id: None | ref: `.task/context-product.md` | note: <what was used>
- source_id: None | ref: `.task/context-tech.md` | note: <what was used>

## Assumptions
- id: A1 | statement: <assumption> | status: open | validated | invalidated
- None

## Docs Index Snapshot
- read: `docs/...` | reason: <why relevant>
- skipped: `docs/...` | reason: <why not needed>

## Architecture Watch
- id: C1 | constraint: <constraint> | concrete_impact: <what it requires> | satisfied_by: DA1 | source_id: <stable id>
- None

## Design Decisions
- id: DA1 | question: <axis question> | chosen: <approach> | rejected: <alternative> | rationale: <why> | source_ids: <stable ids or None> | refactor_class: none | micro-refactor | planned refactor | architectural refactor
- None

## Backlog And Milestone Boundary Check
- implement_now: TASK-X.Y
- planned_together: TASK-A.B, TASK-B.C | None
- shared_seam: <reason or None>
- in_scope_now: <item>
- deferred_to_future_tasks: <item>
- None

## Scope Boundary
- in_scope_now: <item>
- deferred: <item>
- None

## Files
- action: CREATE | path: <path> | purpose: <purpose>
- action: MODIFY | path: <path> | purpose: <purpose>
- None

## Implementation Steps
- step: 1 | action: <what to implement> | satisfies: <RQ/Constraint ids> | source_ids: <stable ids or None>
- None

## AC Coverage
- id: AC1 | source_id: <stable id or None> | implementation: <step or file> | test: <test or evidence>
- None

## Edge Cases / Failure Modes
- id: EC1 | expected_behavior: <behavior> | validation: <test or evidence> | source_ids: <stable ids or None>
- None

## Evidence Map
- claim: <claim> | source: <artifact or file reference>
- None

## Risks And Rollback
- risk: <risk> | mitigation: <mitigation> | source_id: <stable id or None>
- None

## Phases And Dependencies
- phase: Phase 1 | depends_on: None | purpose: <purpose>
- None
```

## Implementation Spec

File: `.task/implementation-spec.md`

```md
# Implementation Spec

## Spec Metadata
- task_id: TASK-X.Y
- source_plan: `.task/selected-plan.md`
- producer: spec-writer

## Inputs Consumed
- source_id: None | ref: `.task/selected-plan.md` | note: <what was used>
- source_id: None | ref: `.task/planning-context.md` | note: <what was used>
- source_id: None | ref: `.task/context-tech.md` | note: <what was used>
- source_id: None | ref: `.task/context-product.md` | note: <what was used>

## Step Specs
### Step 1: <step action from selected-plan>
#### Signatures
- function: <name> | params: <typed params> | returns: <return type> | module: <file path> | source_ids: <stable ids or None>
#### Types
- type: <name> | definition: <type shape> | module: <file path> | source_ids: <stable ids or None>
- None
#### Error Handling
- error: <condition> | error_type: <typed error> | handling: <what happens> | source_ids: <stable ids or None>
- None
#### Integration Points
- calls: <module.function> | expects: <input/output contract> | source_ids: <stable ids or None>
- None
#### Validation Rules
- rule: <invariant or boundary check> | enforced_at: <where> | source_ids: <stable ids or None>
- None

### Step N: <step action from selected-plan>
<same subsections as above>

## Prompt Specs
### Prompt: <prompt file path>
#### Structure
- system_message: <summary of system message content>
- user_template: <template with variable placeholders>
- variables: <list of template variables with types>
#### Content Depth
- taxonomy: <category list with examples>
- disambiguation: <rules for ambiguous cases>
- boundary_cases: <edge cases with expected classification>
#### Output Schema
- format: json | text | structured
- fields: <field name> | type: <type> | required: yes | no
- None
#### Deviation Handling
- deviation: <what can go wrong> | fallback: <what happens>
- None
#### Examples
- input: <concrete input> | expected_output: <concrete output> | path: happy | source_ids: <stable ids or None>
- input: <concrete input> | expected_output: <concrete output> | path: error | source_ids: <stable ids or None>
- None

## AC Behavior Specs
- id: AC1 | source_id: <stable id or None> | happy_path: <function + condition → concrete input→output> | error_path: <function + condition → concrete input→output>
- None

## Spec Gaps
- id: SG1 | step: <step ref> | gap: <what is ambiguous> | proposed_resolution: <suggestion> | blocking: yes | no
- None

## Evidence Map
- spec_claim: <claim> | source: <selected-plan step or context reference>
- None
```

## Plan Verification Report

File: `.task/plan-verification.md`

```md
# Plan Verification Report

## Verdict
- value: PASS | FAIL
- fail_owner: plan | None

## Inputs Consumed
- source_id: None | ref: `.task/selected-plan.md` | note: <what was verified>
- source_id: None | ref: `.task/planning-context.md` | note: <what was verified>
- source_id: <stable id or None> | ref: `docs/...:start-end` | note: <independent verification source>

## Gate Checks
- check: Artifact contract compliance | result: pass | fail
- check: Critic verdict propagated | result: pass | fail
- check: Scope boundary integrity | result: pass | fail
- check: Constraint tracing complete | result: pass | fail
- check: Risk carry-forward | result: pass | fail
- None

## Findings
- id: PV1 | severity: critical | major | minor | statement: <finding> | source_id: <stable id or None> | evidence: <evidence>
- None

## Must Fix
- item: <required fix>
- None

## Evidence Map
- claim: <claim> | source: <artifact or file reference>
- None

## Approved Implementation Handoff
- summary: <what implementation may proceed with, or None on FAIL>
- None
```

## Spec Verification Report

File: `.task/spec-verification.md`

```md
# Spec Verification Report

## Verdict
- value: PASS | FAIL
- fail_owner: spec | None

## Inputs Consumed
- source_id: None | ref: `.task/implementation-spec.md` | note: <what was verified>
- source_id: None | ref: `.task/selected-plan.md` | note: <what was verified>
- source_id: None | ref: `.task/planning-context.md` | note: <what was verified>
- source_id: None | ref: `.task/context-tech.md` | note: <what was verified>
- source_id: None | ref: `.task/context-product.md` | note: <what was verified or not needed>

## Gate Checks
- check: Artifact contract compliance | result: pass | fail
- check: Step coverage complete | result: pass | fail
- check: Codebase signature consistency | result: pass | fail
- check: Behavior traceability complete | result: pass | fail
- check: Prompt spec depth | result: pass | fail | n/a
- None

## Findings
- id: SV1 | severity: critical | major | minor | statement: <finding> | source_id: <stable id or None> | evidence: <evidence>
- None

## Must Fix
- item: <required fix>
- None

## Evidence Map
- claim: <claim> | source: <artifact or file reference>
- None

## Approved Implementation Handoff
- summary: <what implementation may proceed with, or None on FAIL>
- None
```

## Implementer Test Report

File: `.task/implementer-test.md`

```md
# Implementer Test Report

## Verdict
- value: TESTS_READY | NEEDS_REPLANNING

## Inputs Consumed
- source_id: None | ref: `.task/implementation-spec.md` | note: <what was used>
- source_id: None | ref: `.task/selected-plan.md` | note: <what was used>
- source_id: None | ref: `.task/planning-context.md` | note: <what was used>
- source_id: None | ref: `.task/context-tech.md` | note: <what was used>
- source_id: None | ref: `.task/context-product.md` | note: <what was used>
- source_id: None | ref: `.task/working-group-findings.md` | note: <what was used or not present>

## Summary
- summary: <what tests were written and expected RED state>

## Semantic Checks
- check: Raw sources read for relevant `source_id` values | result: pass | fail
- check: Deferred scope untouched | result: pass | fail
- None

## Source Gaps
- id: TG1 | type: MISSED_SOURCE | DISTILLATION_GAP | SPEC_GAP | TESTABILITY_GAP | statement: <gap> | evidence: <evidence>
- None

## Acceptance Criteria
- id: AC1 | result: TEST_WRITTEN | BLOCKED | evidence: <test file + test name or blocker>
- None

## Deviations From Plan
- deviation: <deviation> | reason: <why> | impact: <scope/risk/timeline>
- None

## Review Summary
- created: <path> | purpose: <behavior covered>
- stub: <path> | purpose: <what was stubbed>
- command: <command>
- test_run: <red test summary>
- open_issue: <issue or None>
- None

## Evidence Map
- claim: <claim> | source: <artifact or file reference>
- None
```

## Implementer Core Report

File: `.task/implementer-core.md`

```md
# Implementer Core Report

## Verdict
- value: READY_FOR_INTEGRATION | NEEDS_REPLANNING

## Inputs Consumed
- source_id: None | ref: `.task/implementer-test.md` | note: <what was used>
- source_id: None | ref: `.task/implementation-spec.md` | note: <what was used>
- source_id: None | ref: `.task/selected-plan.md` | note: <what was used>
- source_id: None | ref: `.task/planning-context.md` | note: <what was used>
- source_id: None | ref: `.task/context-tech.md` | note: <what was used>
- source_id: None | ref: `.task/context-product.md` | note: <what was used>
- source_id: None | ref: `.task/working-group-findings.md` | note: <what was used or not present>

## Summary
- summary: <what was implemented and what went green>

## Semantic Checks
- check: Raw sources read for relevant `source_id` values | result: pass | fail
- check: Approved design preserved | result: pass | fail
- check: Deferred scope untouched | result: pass | fail
- None

## Source Gaps
- id: CG1 | type: MISSED_SOURCE | DISTILLATION_GAP | SOURCE_CONTRADICTION | SPEC_GAP | statement: <gap> | evidence: <evidence>
- None

## Acceptance Criteria
- id: AC1 | result: PASS | FAIL | evidence: <test or code evidence>
- None

## Deviations From Plan
- deviation: <deviation> | reason: <why> | impact: <scope/risk/timeline>
- None

## Review Summary
- created: <path> | purpose: <purpose>
- modified: <path> | purpose: <what changed>
- test_run: <test summary>
- cycle: <red-to-green cycle summary>
- open_issue: <issue or None>
- None

## Evidence Map
- claim: <claim> | source: <artifact or file reference>
- None
```

## Implementer Integration Report

File: `.task/implementer-integration.md`

```md
# Implementer Integration Report

## Verdict
- value: READY_FOR_INTEGRATION_RUN | NEEDS_REPLANNING

## Inputs Consumed
- source_id: None | ref: `.task/implementation-spec.md` | note: <what was used>
- source_id: None | ref: `.task/selected-plan.md` | note: <what was used>
- source_id: None | ref: `.task/planning-context.md` | note: <what was used>
- source_id: None | ref: `.task/implementer-core.md` | note: <what was used>
- source_id: None | ref: `.task/implementer-test.md` | note: <what was used>
- source_id: None | ref: `.task/context-tech.md` | note: <what was used>
- source_id: None | ref: `.task/context-product.md` | note: <what was used>
- source_id: None | ref: `.task/working-group-findings.md` | note: <what was used or not present>

## Summary
- summary: <what integration tests were written>

## Semantic Checks
- check: Raw sources read for relevant `source_id` values | result: pass | fail
- check: Risk-driven scenarios covered | result: pass | fail
- None

## Source Gaps
- id: IG1 | type: MISSED_SOURCE | DISTILLATION_GAP | SOURCE_CONTRADICTION | statement: <gap> | evidence: <evidence>
- None

## Acceptance Criteria
- id: AC1 | result: TEST_WRITTEN | BLOCKED | evidence: <test file + test name or blocker>
- None

## Deviations From Plan
- deviation: <deviation> | reason: <why> | impact: <scope/risk/timeline>
- None

## Review Summary
- created: <path> | purpose: <scenario covered>
- command: <command>
- open_issue: <issue or None>
- None

## Evidence Map
- claim: <claim> | source: <artifact or file reference>
- None
```

## Integration Report

File: `.task/integration-report.md`

```md
# Integration Report

## Verdict
- value: PASS | FAIL

## Inputs Consumed
- source_id: None | ref: `.task/implementer-integration.md` | note: <what was used>
- source_id: None | ref: `.task/implementer-core.md` | note: <what was used>
- source_id: None | ref: `.task/selected-plan.md` | note: <what was used>
- None

## Commands Run
- command: <command>
- None

## Environment
- docker_status: healthy | unhealthy
- db_reachable: yes | no
- database_url_target: <host:port or redacted endpoint>

## Check Results
- check: Lint | result: pass | fail | detail: <detail>
- check: Typecheck | result: pass | fail | detail: <detail>
- check: Docker build | result: pass | fail | detail: <detail>
- check: Docker services health | result: pass | fail | detail: <detail>
- check: Unit tests | result: pass | fail | detail: <detail>
- check: Integration tests | result: pass | fail | detail: <detail>

## Failures
- step: <step> | target: <file/test/check> | summary: <error summary>
- None

## Next Action
- action: <what to fix next>
- None

## Evidence Map
- claim: <claim> | source: <command output or artifact reference>
- None
```

## Review Report

Files: `.task/review-a.md`, `.task/review-b.md`

```md
# Review Report

## Verdict
- value: APPROVED | NEEDS_REVISION | NEEDS_REPLANNING | FAILED

## Inputs Consumed
- source_id: None | ref: `.task/selected-plan.md` | note: <what was used>
- source_id: None | ref: `.task/implementation-spec.md` | note: <what was used>
- source_id: None | ref: `.task/planning-context.md` | note: <what was used>
- source_id: None | ref: `.task/working-group-findings.md` | note: <what was used or not present>
- source_id: None | ref: `.task/implementer-core.md` | note: <what was used>
- source_id: None | ref: `.task/implementer-test.md` | note: <what was used>
- source_id: None | ref: `.task/implementer-integration.md` | note: <what was used>
- source_id: None | ref: `.task/integration-report.md` | note: <what was used>

## Findings
- id: RV1 | severity: critical | major | minor | statement: <finding> | source_id: <stable id or None> | evidence: <evidence>
- None

## Suggestions
- suggestion: <optional improvement>
- None

## Integrity Checks
- check: Boundaries respected | result: yes | no
- check: Tests adequate | result: yes | no
- check: Plan adherence | result: yes | no
- check: Edge-case coverage adequate | result: yes | no
- None

## DA Adherence
- id: DA1 | result: delivered | missing | partial | detail: <detail>
- None

## Root-Cause Classification
- category: implementation | plan/context mismatch
- evidence: <file/command/findings>

## Evidence Map
- claim: <claim> | source: <artifact or file reference>
- None
```

## Compliance Report

File: `.task/compliance-report.md`

```md
# Compliance Report

## Verdict
- value: PASS | FAIL

## Inputs Consumed
- source_id: None | ref: `.cursor/artifact-contracts.md` | note: <what was used>
- source_id: None | ref: `tools/check-strict-workflow.sh` | note: <what was used>
- source_id: None | ref: `.task/run-log.md` | note: <what was used>
- source_id: None | ref: `.task/workflow-state.md` | note: <what was used>
- None

## Script Checks
- category: Artifact existence | result: pass | fail | detail: <N/M>
- category: Verdict checks | result: pass | fail | detail: <N/M>
- category: Traceability | result: pass | fail | detail: <N/M>
- category: Artifact format | result: pass | fail | detail: <N/M>
- category: Step ordering | result: pass | fail | detail: <N/M>
- None

## Substance Checks
- check: Design axis quality | result: pass | fail | n/a | detail: <detail>
- check: Constraint satisfaction | result: pass | fail | n/a | detail: <detail>
- check: Source traceability integrity | result: pass | fail | n/a | detail: <detail>
- check: Working group usage reporting | result: pass | fail | n/a | detail: <detail>
- None

## Workflow Compliance Checklist
- item: Required Agent Set used | result: PASS | FAIL
- item: Planning decision gate | result: PASS | FAIL
- item: Integration gate | result: PASS | FAIL
- item: Ensemble review gate | result: PASS | FAIL
- item: Development-plan quality standard | result: PASS | FAIL
- None

## Findings
- id: CR1 | severity: critical | major | minor | statement: <finding> | source_id: <stable id or None> | evidence: <evidence>
- None

## Escalation
- blocker: <what is missing or invalid>
- evidence: <exact files/sections/checks that failed>
- next_action: <specific fix or rerun instruction>
- None

## Evidence Map
- claim: <claim> | source: <artifact or file reference>
- None
```

## Working Group Findings

File: `.task/working-group-findings.md`

```md
# Working Group Findings

## <agent-name> — <invoking-agent> — <phase>
- question: <specific question asked>

### Inputs Consumed
- source_id: <stable id or None> | ref: `path:start-end` | note: <what was read>
- None

### Findings
- finding: <concise answer to the question>
- None

### Evidence Map
- claim: <claim> | source: <artifact or file reference>
- None
```

This file is append-only. Add a new `## <agent-name> — <invoking-agent> — <phase>` block for each invocation.

## Run Log

File: `.task/run-log.md`

```md
# Run Log

- STEP 1: issue intake | status: completed | runtime_wrapper: orchestrator | artifact: `.task/issue.md`
- STEP 2: context-builder-product | status: completed | runtime_wrapper: explore | artifact: `.task/context-product.md`
```

## Workflow State

File: `.task/workflow-state.md`

```md
# Workflow State

## STEP 1: issue intake
status: in_progress | completed | blocked
verdict: N/A | PASS | FAIL | APPROVED | NEEDS_REVISION | NEEDS_REPLANNING
runtime_wrapper: explore | generalPurpose | shell | orchestrator
artifact: `.task/issue.md`
```

## Replan Request

File: `.task/replan-request.md`

```md
# Replan Request

## Metadata
- triggered_by: <agent or gate>
- root_cause: plan | context

## Failing Evidence
- source_id: <stable id or None> | ref: `path:start-end` | note: <failing evidence>
- None

## Required Changes
- change: <what planning must revisit>
- None
```

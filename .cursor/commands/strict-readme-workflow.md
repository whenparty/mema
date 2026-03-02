# Strict README Workflow

Run this task in strict execution mode using `@.cursor/README.md` as the process contract.

## Required behavior

- Execute all workflow steps in order from `@.cursor/README.md`.
- Do not skip mandatory gates.
- Do not move to the next step without artifacts from the previous one.
- If a gate fails, stop and report blockers plus concrete next action.

## Mandatory gates

1. `verifier-model-a` and `verifier-model-b` in parallel on identical inputs
2. `e2e-implementer` coverage update
3. `docker-e2e-runner` local Docker e2e execution with PASS/FAIL evidence
4. `reviewer-model-a` and `reviewer-model-b` in parallel on identical inputs
5. `github-agent` lifecycle actions (issue intake/status/PR/finalization as requested)

## Artifact requirements per step

- `planner`: plan with AC mapping and target files
- `verifier A/B`: independent verdicts + must-fix list
- `implementer`: changed files + tests + commands run
- `e2e-implementer`: e2e scenarios mapped to AC
- `docker-e2e-runner`: report with commands, environment health, failing tests (if any)
- `reviewer A/B`: independent severity-ordered findings + verdict
- `github-agent`: links/status updates and action summary

## Final response contract

Return a `README compliance checklist` with PASS/FAIL for:

- Required Agent Set used
- Ensemble verification gate
- E2E gate
- Ensemble review gate
- GitHub lifecycle gate

Then include:

- Remaining blockers (if any)
- Exact next command the user should run or approve

## Optional input after command

If user passes extra text after the command, treat it as task context and append it to the workflow input.

# Cursor Agent Architecture

This project uses a structured `.cursor` setup for predictable delivery quality.

## Required Agent Set

- `planner`
- `implementer`
- `e2e-implementer`
- `docker-e2e-runner`
- `github-agent`
- `verifier-model-a`
- `verifier-model-b`
- `reviewer-model-a`
- `reviewer-model-b`

## Mandatory Quality Gates

- Ensemble verification is required:
  - run `verifier-model-a` and `verifier-model-b` in parallel on identical inputs
  - run `reviewer-model-a` and `reviewer-model-b` in parallel on identical inputs
  - A and B must use different models
- E2E gate is required:
  - `e2e-implementer` creates black-box e2e coverage from acceptance criteria
  - `docker-e2e-runner` executes local Docker-based e2e checks
- GitHub lifecycle is required:
  - `github-agent` reads task/issue, updates status, creates PR, and finalizes lifecycle actions

## Recommended Workflow

1. `github-agent` intake: read issue and blockers
2. `planner`: produce implementation plan with AC mapping
3. `verifier-model-a` + `verifier-model-b`: validate plan
4. `implementer`: implement changes and tests
5. `e2e-implementer`: create/update black-box e2e tests
6. `docker-e2e-runner`: run Docker e2e and produce evidence
7. `reviewer-model-a` + `reviewer-model-b`: review quality and integrity
8. `github-agent`: update status, create PR, and continue lifecycle

## Rules

Project rules are in `.cursor/rules/`:
- `architecture-boundaries.mdc`
- `testing-conventions.mdc`
- `task-workflow.mdc`

Use repository `AGENTS.md` as the source of truth for architecture constraints and conventions.

## Commands

Project commands are in `.cursor/commands/`:
- `strict-readme-workflow.md` — enforce full end-to-end execution against this README with mandatory gate artifacts and final PASS/FAIL compliance checklist

# Cursor Agent Architecture

This project uses a structured `.cursor/` setup for predictable delivery quality.

The **single source of truth** for the workflow contract is:

> `.cursor/commands/strict-readme-workflow.md`

All workflow steps, mandatory gates, feedback loops, artifact contracts, and orchestrator rules are defined there. Do not duplicate workflow logic in this file.

## Structure

- `agents/` — agent definitions (model, role, I/O contracts)
- `commands/strict-readme-workflow.md` — workflow contract
- `artifact-contracts.md` — artifact schemas and merge rules for `.task/` files
- `rules/` — project rules (`architecture-boundaries.mdc`, `testing-conventions.mdc`)
- `skills/` — project skills (`github-ops/SKILL.md`)

## Quick reference

- **Agents**: see `agents/` for the full set
- **Workflow**: see `commands/strict-readme-workflow.md` for step order, gates, and orchestrator rules
- **Artifact schemas**: see `artifact-contracts.md` for `.task/` file structures
- **Architecture constraints**: see repository root `AGENTS.md`
- **Deterministic checks**: see `tools/check-strict-workflow.sh`

Root `AGENTS.md` is the repository architecture contract, not a duplicate workflow definition.
Repo agent files in `.cursor/agents/` define conceptual roles and output
contracts; runtime subagent wrappers are mapped in
`commands/strict-readme-workflow.md`.

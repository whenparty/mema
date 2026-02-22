---
name: github-issue-manager
description: >
  Standard GitHub issue + project board transitions and comments.
---

# GitHub Issue Manager

## Purpose
Keep issue status and project board columns in sync with task state.

## Inputs
- Issue number
- Project item ID (PVTI_...), if available
- Target status: Backlog | In Progress | In Review | Done
- Comment text (optional)

## Actions
- **Move on board:** use project item ID when available; otherwise query the board
  to resolve the item ID from the issue number.
- **Add comment:** use `gh issue comment` with a short status note.
- **Close issue:** use `gh issue close` only when moving to Done.

## Conventions
- Start comment when work begins: "🚀 Implementation started"
- Start comment for spike: "🔬 Spike investigation started"
- Use In Review only after validation + reviewer verdicts are available
- Do not close issues on blocked work; move back to Backlog instead

## Rules
- Use gh CLI for all operations
- Do not push/merge here; this skill only handles issue + board state

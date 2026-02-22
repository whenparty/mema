---
name: copilot-reviewer
description: Run Copilot CLI review with full context, called by plan-verifier and reviewer subagents.
---

# Copilot Reviewer Skill

## Purpose
Run Copilot CLI as a second reviewer with the same context and checklist
as the calling subagent. Called by plan-verifier and reviewer subagents —
NOT by the orchestrator directly.

## Usage

The calling subagent (plan-verifier or reviewer) passes Copilot the same
context it received, plus the specific checklist for the phase.

## Command
Use a single command and pass full context in the prompt:

```
copilot -p "<context + checklist + verdict request>" --allow-all
```

## Prompt Template

### For Phase 2 (plan verification):
Include these sections in order:
1. Full spec context (FR/NFR/US/AC)
2. Plan (full text)
3. Task description and acceptance criteria
4. Checklist: AC coverage, scope, conventions
5. Request: "Return PASS / FAIL with specific issues"

### For Phase 4 (code review):
Include these sections in order:
1. Full spec context (FR/NFR/US/AC)
2. AGENTS.md conventions summary
3. Plan (full text)
4. Task brief (AC, key files)
5. Checklist: correctness, tests, code quality, conventions, security
6. Request: "Return APPROVED / NEEDS_REVISION / FAILED with reasons"

## Output Handling
- Capture Copilot verdict and summarize the key issues (if any)
- Keep raw output available for reference

## Rules
- Do not use a bare `/review` prompt
- Always provide full context — the same context the calling subagent received
- Run as background Bash to avoid blocking the calling subagent's work

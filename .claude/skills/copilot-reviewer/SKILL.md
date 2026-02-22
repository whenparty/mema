---
name: copilot-reviewer
description: >
  Run Copilot CLI review with full context and collect its verdict.
---

# Copilot Reviewer Skill

## Purpose
Run Copilot CLI review with the same context given to the reviewer agent.

## Inputs
- Task brief (issue, AC, spec summary, key files)
- Approved plan (full text)
- Validation result (PASS/FAIL with details)

## Command
Use a single command and pass full context in the prompt:

```
copilot -p "<context + plan + validation>" --allow-all
```

## Prompt Template
Include these sections in order:
1. Task brief
2. Acceptance criteria checklist
3. Plan summary (or full plan if short)
4. Validation report
5. Request: "Return APPROVED / NEEDS_REVISION / FAILED with reasons"

## Output Handling
- Capture Copilot verdict and summarize the key issues (if any)
- Keep raw output available for reference

## Rules
- Do not use a bare `/review` prompt
- Always provide full context
- Run as background Bash to avoid blocking

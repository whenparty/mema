---
name: execution-summary
description: >
  Standard execution summary template after Phase 4.
---

# Execution Summary Template

Use this exact structure after Phase 4 completes:

```
## Execution Summary: TASK-X.Y

### Subagent Invocations
| Subagent | Invocations | Context (tokens / tool calls) | Reason for re-runs | Return to user |
|----------|:-----------:|:-----------------------------:|---------------------|----------------|
| context-loader  | 1 | NK / N calls | — | No |
| planner         | N | NK / N calls | [verifier FAIL × (N-1)] | No |
| plan-verifier   | N | NK / N calls | [planner revisions × (N-1)] | Yes — plan approval |
| implementer     | N | NK / N calls | [validator FAIL × A, review × B] | No |
| validator       | N | NK / N calls | [impl fix × A, review fix × B] | No |
| reviewer        | N | NK / N calls | [revision × (N-1)] | No |
| finalizer       | 1 | NK / N calls | — | Yes — commit |
| **Total**       | **N** | **~NK / N calls** | | **N stops** |

### Returns to User
| # | Phase | Reason | Was it necessary? |
|---|-------|--------|-------------------|
| N | After Phase Na | [reason] | [Yes/No — assessment] |

### Context Efficiency
| Subagent | Assessment |
|----------|------------|
| [name] | [Efficient/Heavy — reason, e.g. "re-read files already loaded by context-loader"] |

### Tool Issues
- [tool name] — [what failed and why] (or "None")

### Stops
- Plan approval: [user approved / user modified plan / N clarification rounds]
- Failures: [none / list of phases where STOP was triggered]
```

## Rules
- Keep counts up to date throughout execution
- Include any tool permission denials
- Be concise; no extra narrative

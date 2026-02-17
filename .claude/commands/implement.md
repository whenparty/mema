Implement task: $ARGUMENTS

## Phase 0: Load Context

1. Search GitHub issues in `whenparty/mema` for the task ID ($ARGUMENTS) in the title
2. Read the issue body — extract description, dependencies, traceability
3. Check if dependency issues are all closed. If any are open, STOP and list blockers
4. Add comment to issue: "🚀 Implementation started"

## Phase 1: Plan

Use the planner agent to create an implementation plan for this task.
Read the task description from docs/specification/5_1_Backlog.md.
Pass the GitHub issue body as additional context to the planner.

Present the plan and wait for my approval.

## Phase 2: Implement

After plan approval, use the implementer agent to execute the plan
step by step following TDD.

## Phase 3: Review

After implementation is complete, use the reviewer agent to review
all changes against the plan.

If verdict is NEEDS_REVISION:
- Pass the review feedback to the implementer agent
- Implementer fixes the issues
- Run reviewer again
- Maximum 5 revision cycles. If still not APPROVED after 5 cycles, STOP
  and present all unresolved issues to me.

If verdict is FAILED:
- STOP and present the failure to me

If verdict is APPROVED:
- Proceed to Phase 4

## Phase 4: Close Loop

1. Add comment to the GitHub issue with the review verdict and summary of changes
2. If APPROVED: suggest a conventional commit message that references the issue
   (e.g., `feat(spike): verify Bun compatibility closes #15`)
3. STOP and wait for me to commit

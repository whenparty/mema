# Project Status

Show current sprint status by combining AGENTS.md state with live GitHub data.

## Process

1. Read the "Current Sprint" section from AGENTS.md to get current milestone name
2. Fetch all open issues for the current milestone from GitHub (`whenparty/mema`)
3. Group issues by status:
   - **In Progress** — issues with "In Progress" status on project board
   - **Ready** — issues where ALL dependency issues are closed
   - **Blocked** — issues where at least one dependency issue is still open
   - **Done** — closed issues in this milestone
4. Show summary:
   - Milestone name and target date
   - Count: done / total issues
   - List each group with issue number, task ID, and title
5. If any decisions are pending (from Spike Results table in AGENTS.md), list them

## Output Format

```
## M0 · Spikes & Foundation (target: 2026-03-07)
Progress: 3/18 done

### ✅ Done (3)
- #12 TASK-0.1: Bun runtime compatibility
- #13 TASK-0.2: Drizzle + pgvector
- #14 TASK-1.1: Initialize repository

### 🔄 In Progress (1)
- #15 TASK-0.3: Combined LLM extraction call

### 🟢 Ready (5)
- #16 TASK-0.11: Webhook vs Long Polling
...

### 🔴 Blocked (9)
- #20 TASK-1.3: Database schema — blocked by #13 (open)
...

### ⏳ Pending Decisions
- TASK-0.3: Combined vs separate LLM calls
```

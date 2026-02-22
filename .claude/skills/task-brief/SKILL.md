---
name: task-brief
description: >
  Standard task-brief collection and GitHub issue enrichment.
---

# Task Brief + Issue Enrichment

## Purpose
Collect task context and normalize the issue body with acceptance criteria and references.

## Inputs
- Task ID (TASK-X.Y)
- Repo: whenparty/mema

## Steps
1. Search GitHub issues for the task ID in title; capture issue number
2. Read the issue body; extract description, dependencies, traceability (FR/NFR/US)
3. Read docs/specification/5_1_Backlog.md; find task entry and extract estimate, deps, traceability, labels
4. Check dependency issues; report open vs closed
5. Read .claude/skills/specification-navigator/SKILL.md — extract the **full document map**
   (the table of all spec files with descriptions and "read when you need" hints)
6. Read ALL spec docs referenced by traceability (FR/NFR/US) and extract the **full text**
   of every relevant requirement, user story, and acceptance criterion — not summaries or links
7. Enrich the GitHub issue body by appending:

```
### Acceptance Criteria
- [ ] [derived from FR/US/AC in spec docs]
- [ ] tests pass, typecheck clean, lint clean

### Key Files
- src/path/to/file.ts — [what it does]

### Spec References
- FR-MEM.1 (docs/specification/3_1_Functional_Requirements.md) — [short description]
```

8. Read module AGENTS.md files for affected modules (if they exist)

## Output
Return a task brief in this exact format:

```
Task: TASK-X.Y — [title]
Issue: #<number>
Board Item ID: <PVTI_...>
Estimate: N h
Dependencies: all closed | [list of open blockers]
Acceptance Criteria: [checklist]

Full Spec Context:
[full text of every FR, NFR, US, and AC relevant to this task — copy verbatim from spec docs]

Spec Document Map:
[full document map from specification-navigator — all files with descriptions and reading hints]

Key Files: [existing files to modify + new files to create]
Module Context: [summary from module AGENTS.md, or "new module"]
```

## Rules
- Do not guess missing requirements
- Always include the quality-gate AC (tests/typecheck/lint)
- Include the FULL TEXT of relevant spec sections — downstream subagents rely on this
  as their primary spec context and should not need to re-read spec docs for core requirements
- Include the full document map so downstream subagents can locate additional docs if needed

---
name: github-ops
description: >-
  GitHub project board and issue operations for whenparty/mema.
  Use when the workflow needs to read issues, move board cards,
  create PRs, or comment on issues.
---

# GitHub Operations

Procedural `gh` CLI commands for the orchestrator to execute directly.

## Repository

`whenparty/mema`

## Board Configuration

| Field | ID |
|---|---|
| Project | `PVT_kwDOBvUeOc4BPZGN` |
| Status Field | `PVTSSF_lADOBvUeOc4BPZGNzg90FRk` |

| Status | Option ID |
|---|---|
| Backlog | `474037f0` |
| In Progress | `494cf029` |
| In Review | `34dc5401` |
| Done | `b3c332a7` |

## Operations

### 1. Read Issue

Before writing `.task/issue.md`, read `.cursor/artifact-contracts.md` and follow the exact `Issue Packet` contract.

```bash
gh issue view <NUMBER> --repo whenparty/mema --json number,title,body,state
```

Check dependencies mentioned in the body:

```bash
gh issue view <DEP_NUMBER> --repo whenparty/mema --json state --jq '.state'
```

Find Board Item ID:

```bash
gh api graphql -f query='
query {
  organization(login: "whenparty") {
    projectV2(number: 1) {
      items(first: 100) {
        nodes { id content { ... on Issue { number } } }
      }
    }
  }
}'
```

Find the node where `content.number` matches the issue number.

If the issue body contains a `### Planning Bundle` section:

- populate `planning_bundle` from the listed related `TASK-*`
- populate `implement_now` from the explicit current-task marker
- populate `planning_bundle_reason` from the shared seam text

If the issue has no planning-bundle section, write:

- `planning_bundle: None`
- `implement_now: TASK-X.Y`
- `planning_bundle_reason: None`

Write to `.task/issue.md`:

```
# Issue Packet

## Metadata
- task_id: TASK-X.Y
- issue_number: <number>
- title: <title>
- state: OPEN | CLOSED
- board_item_id: PVTI_...
- dependency_status: ALL_CLOSED | HAS_OPEN_DEPS
- planning_bundle: TASK-X.Y, TASK-A.B | None
- implement_now: TASK-X.Y
- planning_bundle_reason: <shared architecture seam or None>
- source: github

## Raw Issue Body
<<<ISSUE_BODY_START
<full issue body markdown>
>>>ISSUE_BODY_END

## Dependencies
- task_id: TASK-X.Y | issue_number: <N> | state: open|closed | relation: blocks
- None

## Git State
- branch: <current branch or main>
- base_branch: main
- status_summary: clean | dirty

## Intake Notes
- note: <blocker, ambiguity, or intake note>
- None
```

### 2. Move Card

```bash
gh api graphql -f query='
mutation {
  updateProjectV2ItemFieldValue(input: {
    projectId: "PVT_kwDOBvUeOc4BPZGN"
    itemId: "<BOARD_ITEM_ID>"
    fieldId: "PVTSSF_lADOBvUeOc4BPZGNzg90FRk"
    value: { singleSelectOptionId: "<STATUS_OPTION_ID>" }
  }) { projectV2Item { id } }
}'
```

Replace `<BOARD_ITEM_ID>` from `.task/issue.md` and `<STATUS_OPTION_ID>` from the table above.

### 3. Comment on Issue

```bash
gh issue comment <NUMBER> --repo whenparty/mema --body "<MESSAGE>"
```

### 4. Create PR

Push and create PR as a single chained command:

```bash
git push -u origin <BRANCH> && gh pr create --repo whenparty/mema --title "<TITLE>" --body "$(cat <<'EOF'
## Summary
<changes summary>

## Acceptance Criteria
<AC as checklist>

## Deviations from Plan
<deviations or "None">

## Review Summary
<reviewer verdicts>

Closes #<ISSUE_NUMBER>
EOF
)"
```

## Workflow Integration

| Workflow moment | Operations to run |
|---|---|
| Step 1 (intake) | Read Issue → write `.task/issue.md`, Move Card → In Progress (`494cf029`) |
| Step 8 (before implementation) | Create branch, Comment "Implementation started" |
| After Step 14 (compliance pass) | Push branch, Create PR, Move Card → In Review (`34dc5401`) |

## Constraints

- Never force-push to `main`/`master`.
- Board Item ID: query once at intake, reuse from `.task/issue.md`.

# github-agent

## Role

Single point of contact for all GitHub and git operations.
Called multiple times across phases with different tasks.

## Tools

- `gh` CLI, `git` CLI — YES (via Bash)
- Read, Write, Edit — NO

## Common Context

Repository: `whenparty/mema`

### Project Board

- Project ID: `PVT_kwDOBvUeOc4BPZGN`
- Status Field ID: `PVTSSF_lADOBvUeOc4BPZGNzg90FRk`
- Status Options:
  - Backlog: `474037f0`
  - In Progress: `494cf029`
  - In Review: `34dc5401`
  - Done: `b3c332a7`

### Known Board Item IDs (cache)

- TASK-0.1 (#1): `PVTI_lADOBvUeOc4BPZGNzgllUD4`
- TASK-0.2 (#2): `PVTI_lADOBvUeOc4BPZGNzgllUEc`
- TASK-0.3 (#3): `PVTI_lADOBvUeOc4BPZGNzgllUEs`
- TASK-0.3-ext (#84): `PVTI_lADOBvUeOc4BPZGNzgl4ERY`
- TASK-1.4 (#15): `PVTI_lADOBvUeOc4BPZGNzgllULI`
- TASK-1.5 (#16): `PVTI_lADOBvUeOc4BPZGNzgllULo`
- TASK-1.6 (#17): `PVTI_lADOBvUeOc4BPZGNzgllUMA`

### GraphQL: Move Item to Status

```graphql
mutation {
  updateProjectV2ItemFieldValue(input: {
    projectId: "PVT_kwDOBvUeOc4BPZGN"
    itemId: "<ITEM_ID>"
    fieldId: "PVTSSF_lADOBvUeOc4BPZGNzg90FRk"
    value: { singleSelectOptionId: "<STATUS_OPTION_ID>" }
  }) { projectV2Item { id } }
}
```

### GraphQL: Find Board Item ID

If not in cache, query:

```graphql
query {
  organization(login: "whenparty") {
    projectV2(number: 1) {
      items(first: 100) {
        nodes { id content { ... on Issue { number } } }
      }
    }
  }
}
```

Find the item where `content.number` matches the issue number.

## Instructions

The orchestrator provides a specific task each time you are called.
Read this file first (`cat .claude/skills/implement/agents/github-agent.md`),
then execute the task using the common context above.

Always return structured output as specified by the orchestrator.

# .claude/ — Claude Code Configuration

## Why agent files are NOT in `.claude/agents/`

Claude Code [auto-discovers](https://code.claude.com/docs/en/sub-agents) markdown
files in `.claude/agents/` and delegates tasks to them based on the `description`
field in YAML frontmatter. This is the **native subagent** system.

We intentionally do **not** use it. Our agent files live in
`.claude/skills/implement/agents/` — a path Claude Code does not scan.

### Reason: orchestrator control

The `/implement` workflow (`.claude/commands/implement.md`) is a deterministic
6-phase pipeline with explicit state passing, retry loops, and STOP points.
The orchestrator decides exactly which subagent runs, when, with what data.

Native subagents break this: Claude auto-delegates based on task description,
bypassing the orchestrator's phase ordering and data flow. A user asking
"create a branch" could trigger `github-agent` directly, skipping dependency
checks, context building, and board status updates.

### How it works instead

1. `/implement TASK-X.Y` expands `.claude/commands/implement.md` as a prompt
2. The orchestrator uses the **Task tool** with built-in `subagent_type`s
   (`Bash`, `Explore`, `Plan`, `general-purpose`)
3. Each Task prompt says `Follow .claude/skills/implement/agents/<name>.md`
4. The subagent reads the `.md` file for role, instructions, and output format
5. Tool access is controlled by `subagent_type`, not YAML frontmatter

### Consequence: no YAML frontmatter needed

Since these files are reference docs read by subagents (not native subagent
definitions), they don't need `name`, `description`, `tools`, or `model`
fields. That metadata lives in the orchestrator's agent table in `implement.md`.

## Directory layout

```
.claude/
  commands/
    implement.md          — /implement slash command (orchestrator)
  skills/
    implement/
      agents/             — agent reference docs (NOT native subagents)
        github-agent.md
        implementer.md
        planner.md
        ...               — 12 files total
  settings.json           — permissions (allow/deny rules)
  README.md               — this file
```

## settings.json

Deny rules are evaluated first — they block destructive git operations even
though `Bash(git *)` is in the allow list. See
[permissions docs](https://code.claude.com/docs/en/permissions).

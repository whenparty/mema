# /implement Reference

Supporting documentation for the `/implement` command. The orchestrator consults
this file when it needs to check subagent boundaries, context rules, or efficiency patterns.

---

## Recommendations for Context Optimization

Based on observed patterns:

1. **Full spec context is collected once in Phase 0.** The task-brief subagent reads all
   relevant FR/NFR/US/AC and the spec document map. This is passed to all downstream
   subagents — they should not need to re-read core spec docs.
2. **Subagents may read additional specs.** The document map is provided so planner,
   plan-verifier, and reviewer can locate and read additional spec files if needed
   beyond what's in the brief.
3. **Config files are summarized once in Phase 0.** The config-summary subagent (haiku)
   reads bun.lock, package.json, tsconfig, docker-compose, Dockerfile, drizzle.config
   and produces a ~50-line summary. Pass this summary to planner, implementer, and reviewer —
   they should NOT read these files directly.
4. **Validator is the most efficient.** Minimal context, auto-detects scope — good model
   for what a focused subagent should look like.
5. **Returns to user are mandatory at two points:** plan approval (Phase 2) and commit (Phase 5).
   Both are intentional safety gates — do not try to skip them.
6. **All reviewer revisions go through the full loop.** implementer→validator→reviewer.
   This keeps responsibility boundaries clean — the orchestrator never writes code.
7. **Copilot is launched by the verifier/reviewer subagent, not the orchestrator.**
   In Phase 2, plan-verifier runs its own analysis first, then launches Copilot with the
   same context. In Phase 4, reviewer does the same. Each subagent returns both verdicts.

---

## Subagent Responsibility Matrix

Each subagent has a strict scope. No overlaps — if two agents could do the same thing,
only one is responsible.

| Subagent | Role | Reads code | Writes code | Allowed commands | Reads specs |
|----------|------|:----------:|:-----------:|------------------|:-----------:|
| **context-loader** (general-purpose) | Gather task context from GitHub + specs | no | no | `gh` | yes |
| **config-summary** (Explore, haiku) | Summarize project config files | no | no | none | no |
| **planner** | Create step-by-step plan | yes | no | none | additional specs only |
| **plan-verifier** | Check plan correctness + run Copilot | yes | no | `copilot` | from brief + additional |
| **implementer** | Write code via TDD | yes | **yes** | `bun run test <file>`, `bun run typecheck`, `bun run lint` | no |
| **validator** | Run CI + Docker checks (auto-detects e2e) | no | no | `bun run test`, `bun run typecheck`, `bun run lint`, `docker compose` + e2e (auto-detected) | no |
| **reviewer** | Evaluate code quality + run Copilot | yes | no | `git diff`, `git status`, `copilot` | from brief + additional |
| **finalizer** | Update GitHub + AGENTS.md | no | **yes** (AGENTS.md only) | `gh` | no |

**Key boundaries:**
- **validator owns CI** — only it runs full test suite/typecheck/lint/docker. Auto-detects e2e.
- **implementer owns TDD** — runs `bun run test <file>` per step. May run typecheck/lint. Does NOT run full test suite.
- **reviewer owns code quality** — reads diffs and files. Does NOT run any build/test/lint. Launches Copilot for second opinion.
- **plan-verifier owns plan quality** — checks AC coverage, scope, conventions. Launches Copilot for second opinion.
- **planner is read-only** — no Bash, no writes.

---

## Context Management

All heavy work runs in subagents to protect the main context window:
- **general-purpose** (Phase 0) — reads issue, backlog, specs; enriches issue; returns task brief with full spec context and document map
- **Explore/haiku** (Phase 0, parallel) — reads config files (package.json, bun.lock, tsconfig, docker-compose, Dockerfile, drizzle.config); returns ~50-line summary. Subsequent subagents receive this summary instead of reading raw config files
- **planner** — uses full spec context from brief, reads additional specs if needed + codebase, produces plan with 3-round self-verification
- **plan-verifier** — checks plan against AC, scope, conventions; launches Copilot; returns combined verdict
- **implementer** — writes code following TDD with `--reporter=dots` for minimal output
- **validator** — runs test/typecheck/lint + docker/e2e (auto-detected), returns structured PASS/FAIL report
- **reviewer** — reads git diff, evaluates correctness/quality/security; launches Copilot; returns combined verdict
- **finalizer** (Phase 5) — updates GitHub issue, AGENTS.md, module AGENTS.md; returns commit message

The main orchestrator only sees: task brief, plan, verification result, change summary,
validation report, review verdict, commit message.

**Rules for subagent context:**
- Pass full context INTO subagents explicitly — they do not inherit conversation history
- Full spec context and document map flow from Phase 0 task brief into all subagents
- Always pass the approved plan to implementer (including in revision loops)
- In loops, pass only the LATEST failure/review output — not the full history

## Phase 1: Scaffold

Use the project-architect agent to analyze docs/specification/
and propose a project structure. Wait for my approval before
creating any files.

## Phase 2: Review

After scaffolding is complete, use the reviewer agent to verify:

1. Created structure matches the proposed and approved structure exactly —
   no missing directories, no extra directories, no renames
2. CLAUDE.md is complete:
   - Project identity and tech stack
   - Full directory tree with descriptions
   - All key components listed (check against specification)
   - @-references to specification docs
   - Commands section
   - Code conventions
3. .env.example covers all environment variables from the specification
4. .gitignore is comprehensive for Bun/TypeScript projects

Present the review verdict. If NEEDS_REVISION, list specific issues
and fix them before presenting to me.

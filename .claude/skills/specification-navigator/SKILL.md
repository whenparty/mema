---
name: specification-navigator
description: >
  Navigate and extract information from project specification documents
  in docs/specification/. Use when you need to understand requirements,
  architecture, data model, or any design decision.
---

# Specification Navigator

## Document Map

All specification documents are in `docs/specification/`.

### Phase 1 — Discovery (why and for whom)
| File | Contains | Read when you need |
|------|----------|--------------------|
| 1_1_Problem_Statement.md | Problem definition, positioning, hypothesis | Product context, what the product is NOT |
| 1_2_Target_Audience.md | User personas, use cases | Understanding user needs and scenarios |
| 1_3_Competitive_Landscape.md | Competitors analysis, differentiation | Positioning decisions |

### Phase 2 — Vision & Scope (what we build)
| File | Contains | Read when you need |
|------|----------|--------------------|
| 2_1_Product_Vision_Statement.md | Vision, principles, platform strategy | Product identity, core principles |
| 2_2_Goals_Success_Metrics.md | KPIs, North Star, activation funnel | Success criteria, metric definitions |
| 2_3_Scope_In_Out.md | MVP boundaries, what's in/out/never | Scope decisions, feature boundaries |

### Phase 3 — Requirements (what it must do)
| File | Contains | Read when you need |
|------|----------|--------------------|
| 3_1_Functional_Requirements.md | All FR with priorities (MUST/SHOULD/COULD) | Implementing any feature |
| 3_2_Non-Functional_Requirements.md | Performance, reliability, security, cost | Infrastructure, quality attributes |
| 3_3_User_Stories_Acceptance_Criteria.md | User stories with Given/When/Then | Writing tests, verifying behavior |
| 3_4_User_Flow.md | Flow diagrams for all scenarios | Understanding user journeys |

### Phase 4 — Design (how it works)
| File | Contains | Read when you need |
|------|----------|--------------------|
| 4_1_Information_Architecture.md | Intents, routing, dialog states, pipeline steps | Message handling, intent classification |
| 4_2_Conversation_Design.md | Example dialogs, tone, bot personality | Writing prompts, response formatting |
| 4_3_Data_Model.md | All entities, fields, relationships, ER diagram | Database schema, queries, migrations |
| 4_4_System_Architecture.md | Stack, components, LLM strategy, deployment | Any architectural decision |

### Phase 5 — Planning (how we build it)
| File | Contains | Read when you need |
|------|----------|--------------------|
| 5_1_Backlog.md | All tasks with estimates and dependencies | Task planning, dependency checking |
| 5_2_Milestones.md | Release plan, milestone definitions of done | Sprint planning, scope decisions |
| 5_3_Tech_Spikes.md | Technical unknowns and investigation plans | Before starting uncertain tasks |

## Reading Strategy

- **Starting a new task?** Read the task in 5_1_Backlog.md first,
  then follow its traceability links to FR/US documents.
- **Implementing a feature?** Read 3_1 (requirements) → 4_1 (routing) →
  4_4 (architecture) → 4_3 (data model) in that order.
- **Writing prompts?** Read 4_2 (conversation design) → 4_1 (intents).
- **Setting up infrastructure?** Read 4_4 (architecture) → 3_2 (NFR).
- **Scaffolding project structure?** Read 4_4 (architecture) →
  4_3 (data model) → 3_1 (requirements) → 4_1 (routing).
  These four documents contain everything needed for directory
  structure decisions.
- **Unsure about scope?** Read 2_3 (scope) → check if feature is
  In/Out/Never.

## Key Architectural Decisions

- **12-step message pipeline** — canonical in 4_4, business logic in 4_1
- **Tiered Memory** — User Summary (Tier 1) + pgvector search (Tier 2) +
  short-term context (Tier 3) — defined in 4_4
- **Multi-model generation** — two powerful models parallel + validator
  for standard requests — defined in 4_4 and FR-COM.5
- **Dialog states** — IDLE / CONFIRM / AWAIT with context.type
  discriminator — defined in 4_1 and 4_3
- **Fact extraction** — combined LLM call for steps 4-8 of pipeline
  with structured output — defined in 4_4

### Decisions
| Location | Contains | Read when you need |
|----------|----------|--------------------|
| docs/decisions/README.md | Index of all architecture decisions | Overview of what's decided |
| docs/decisions/NNN-*.md | Individual decision write-ups | Implementation details for a specific technology choice |

**Reading strategy for decisions:**
- Before implementing any task: check if dependency spikes have accepted decisions
- After completing a spike: create decision document from TEMPLATE.md
- When planner encounters a TBD in AGENTS.md: check if decision exists in docs/decisions/

## Rules

- NEVER guess about requirements. If a document doesn't cover
  your question, say so.
- Read the MINIMUM documents needed. Do not load all 17 files.
- Follow traceability: FR → US → AC. If a task references FR-MEM.1,
  read that section, not the whole document.
- When citing a requirement, include the ID (e.g., FR-MEM.1, US-MEM.3).

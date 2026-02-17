# 1.3 Competitive Landscape

## Market Overview

The market for AI assistants with long-term memory is actively evolving. By early 2026, memory has moved from being an experimental feature to a mandatory attribute of a competitive product. However, approaches to implementation and product focus vary widely.

Existing solutions can be divided into three categories: major platforms, niche products, and infrastructure platforms for developers.

---

## Category 1: Major AI Platforms

Universal AI assistants where memory is one of many features.

### ChatGPT (OpenAI) — [chatgpt.com](https://chatgpt.com)

- **Memory:** two mechanisms — "saved memories" (explicit) and "chat history" (automatic extraction from conversation history). Full version available on Plus/Pro ($20–200/mo); free users only get saved memories.
- **Limitations:** saved memories limit of ~1,200–1,400 words; memory sometimes oversimplifies facts, losing nuance; editing stops working when memory overflows. Users complain about opacity — memory affects responses in unexpected ways.
- **Platform:** web, mobile app, API.

### Claude (Anthropic) — [claude.ai](https://claude.ai)

- **Memory:** long-term memory based on conversation history. User can view and edit.
- **Limitations:** memory is tied to the claude.ai platform; in the API, memory is not available — each request is stateless.
- **Platform:** web, mobile app, API.

### Gemini (Google) — [gemini.google.com](https://gemini.google.com)

- **Memory:** remembers user preferences and interests. Available for Gemini Advanced.
- **Limitations:** tied to the Google ecosystem; limited user control.
- **Platform:** web, mobile app, integration with Google services.

### Meta AI — [meta.ai](https://www.meta.ai)

- **Memory:** remembers preferences and context, personalizes responses. Integrated with the Meta ecosystem (WhatsApp, Instagram, Messenger).
- **Limitations:** tied to the Meta ecosystem; privacy concerns — data is linked to social media profiles.
- **Platform:** standalone app, integration into Meta products.

### Perplexity — [perplexity.ai](https://www.perplexity.ai)

- **Memory:** automatically loads critical context from past conversations. Works cross-model — the user can switch models between questions, and memory persists.
- **Limitations:** focused on search rather than personal memory; paid subscription for full access.
- **Platform:** web, mobile app.

### Common Weaknesses of This Category

- Memory is a supplementary feature in a universal product, not the UX core.
- Ecosystem lock-in: memory is not portable across platforms.
- User has limited control over what is remembered and how it affects responses.
- Paid subscriptions ($20+/mo) for full access to memory.

---

## Category 2: Niche Products

Products where memory is the central feature but with a narrow positioning.

### Personal.ai — [personal.ai](https://www.personal.ai)

- **Focus:** creating a personal AI twin based on "memory stacks."
- **Memory:** user uploads data (texts, files, links), and AI trains on them. Has a response "accuracy" metric.
- **Pricing:** free plan (100 memories), paid plans from $33/mo.
- **Limitations:** oriented toward creating a "digital twin," not a daily assistant. Requires active training from the user. Complex interface.

### HereAfter AI — [hereafter.ai](https://www.hereafter.ai)

- **Focus:** interactive preservation of life stories for family.
- **Memory:** user records stories by voice following prompts from a virtual interviewer. Relatives can ask questions and hear answers in the narrator's voice.
- **Pricing:** from $3.99/mo, one-time plans from $99. 14-day free trial.
- **Limitations:** oriented toward creating a "legacy" for future generations, not a daily assistant. Requires active story recording. App Store reviews indicate unstable app performance.

### MemoryPlugin — [memoryplugin.com](https://www.memoryplugin.com)

- **Focus:** cross-platform memory for existing AI (ChatGPT, Claude, Gemini).
- **Memory:** plugin that adds long-term memory to any AI assistant.
- **Pricing:** from $15/mo, lifetime — $400.
- **Limitations:** an add-on, not a standalone product. Requires technical setup. Depends on the underlying AI's functionality.

### Common Weaknesses of This Category

- Narrow use cases: "digital twin," "memory journal," "plugin" — none focus on simple everyday use with contextual assistance.
- Paid subscriptions with no free alternative or with a severely limited free plan.
- High barrier to entry: require active training or technical setup.

---

## Category 3: Infrastructure Platforms

Building blocks for developers, not finished products.

### Letta (ex-MemGPT) — [letta.com](https://www.letta.com)

- **Focus:** platform for building stateful AI agents with long-term memory.
- **Capabilities:** self-editing memory, multi-agent systems, model-agnostic, REST API.
- **Pricing:** open-source + Letta Cloud (PaaS with subscription).
- **Limitations:** product for developers. End users need to assemble the solution themselves.

### Mem0 — [mem0.ai](https://mem0.ai)

- **Focus:** memory layer for AI applications. Compresses chat history into optimized representations.
- **Capabilities:** SDK for Python/JS, integration with OpenAI, LangGraph, CrewAI.
- **Limitations:** pure infrastructure, no user interface.

### Supermemory — [supermemory.ai](https://supermemory.ai)

- **Focus:** universal memory API for enterprise and personal AI assistants.
- **Capabilities:** memory graph, data source connectors, scaling up to 50M tokens per user.
- **Limitations:** enterprise-oriented. Does not offer a consumer product.

### Common Weaknesses of This Category

- These are APIs and SDKs, not products. End users cannot use them directly.
- Require development to build a finished solution.

---

## Comparison Table

| Solution | Type | Memory as Core | User Simplicity | Memory Control | Price |
|----------|------|:-:|:-:|:-:|------|
| ChatGPT | Platform | ❌ | ✅ | 🟡 | $0–200/mo |
| Claude | Platform | ❌ | ✅ | 🟡 | $0–100/mo |
| Gemini | Platform | ❌ | ✅ | 🟡 | $0–20/mo |
| Meta AI | Platform | ❌ | ✅ | ❌ | Free |
| Perplexity | Platform | ❌ | ✅ | 🟡 | $0–20/mo |
| Personal.ai | Niche | ✅ | ❌ | ✅ | $0–33/mo |
| HereAfter AI | Niche | ✅ | 🟡 | ❌ | $3.99–199 |
| MemoryPlugin | Niche | ✅ | ❌ | 🟡 | $15/mo |
| Letta | Infra | ✅ | ❌ | ✅ | Open-source + cloud |
| Mem0 | Infra | ✅ | ❌ | ✅ | API pricing |
| **Our Product** | **Niche** | **✅** | **✅** | **✅** | **Free (pet)** |

---

## Our Positioning

None of the existing products combine three qualities simultaneously:

1. **Memory as core** — the entire UX is built around remembering and using personal context
2. **User simplicity** — zero barrier to entry, no setup, just chat
3. **Transparent control** — the user can see what's been remembered and can edit it

Major platforms are simple, but memory is a secondary feature. Niche products focus on memory but are complex to use or tailored to narrow use cases (twin, journal). Infrastructure platforms are powerful but are not products for end users.

Our product occupies the intersection: **memory-focused + simple for the everyday user**.

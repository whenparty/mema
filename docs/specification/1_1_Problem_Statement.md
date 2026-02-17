# 1.1 Problem Statement

## Problem

Every day, people share important life information with AI assistants — plans, events, decisions — but the context between sessions is either lost or managed opaquely.

Existing solutions fall into three categories, each with its own limitations:

**Major platforms** (ChatGPT, Gemini, Claude, Meta AI, Perplexity) have already implemented long-term memory features; however, memory in these products is a supplementary feature, not the product's core. It is tied to the ecosystem, non-portable across services, and the user has limited control over what is remembered and how it is used.

**Niche products** (Personal.ai, HereAfter AI) focus on memory but target specific use cases — creating a "digital twin" or a memory journal — and require paid subscriptions.

**Infrastructure platforms** (Letta, Mem0, Supermemory) provide powerful APIs for developers, but these are building blocks, not ready-made products for end users.

---

## Positioning

A lightweight personal assistant where memory is the product's core, not a feature.

**Memory-first.** The assistant can do other things — answer questions, find information — but the entire UX and key scenarios are built around personal memory: remembering meaningful facts, contextual search across them, reminders on request.

**Simplicity above all.** Zero setup: no configuration needed, just chat — the bot understands what's worth remembering on its own. The UX is so seamless that there's no desire to "fix" anything manually.

**Lightweight control.** When needed, the user can view what's been remembered, edit, or delete. But this is a safety net, not the primary usage pattern.

---

## Solution Hypothesis

Telegram bot (MVP) → mobile app (post-MVP):

- **Remembers** — extracts meaningful facts from natural conversation (relocation, events, preferences)
- **Applies context** — uses accumulated memory when responding to subsequent questions
- **Reminds on request** — user asks to be reminded about an event — the bot does so at the right time
- **Provides control** — viewing, editing, and deleting memories

---

## What This Is Not

- Not a universal AI assistant (email, calendar, tasks, web search)
- Not a "digital twin" or memory journal for descendants
- Not a proactive agent acting without user request
- Not a note-taking app / second brain (Notion, Obsidian)

---

## Target Audience (high-level)

People who want an AI conversational partner with manageable long-term memory — simple, focused, and not tied to a major platform's ecosystem. Details — in artifact 1.2.

---

## Constraints

- User data is strictly isolated (multi-tenant)
- MVP — Telegram bot, post-MVP — mobile app
- Budget: minimal infrastructure costs (pet project)

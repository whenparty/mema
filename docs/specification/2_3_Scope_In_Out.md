# 2.3 Scope — In / Out

## Purpose

MVP boundaries. Functionality not listed in the "In" section is considered outside the MVP scope.

---

## In — Included in MVP

### Memory

- **Automatic fact extraction.** The bot identifies meaningful facts from natural conversation (events, preferences, dates, people, decisions) and saves them without an explicit command. When explicitly asked to remember — confirms the save.
- **Memory application in responses.** The bot takes previously saved facts from prior sessions into account when generating responses.
- **Contextual summary.** The system automatically maintains a compact summary of key facts and pattern-derived insights about the user, which is always present in the response generation context. Rebuilt in the background as new facts accumulate.
- **Memory viewing.** The user requests saved facts in natural language ("what do you know about me?", "what do you remember about my job?").
- **Fact editing and deletion.** The user corrects or deletes facts through conversation ("forget that I live in Berlin", "I no longer work at Google"). No separate UI is provided.
- **Interest detection.** The system automatically identifies recurring topics in the user's queries and offers to save them as interests. Analysis is performed in the background; confirmation — through conversation.

### Reminders

- **One-time.** The bot sends a message at a specified time upon the user's request.
- **Recurring.** The bot delivers reminders at the requested frequency.
- **Management.** Viewing, canceling, and modifying active reminders through conversation.

### Communication

- **Contextual responses.** The bot answers questions with a priority on personalization through accumulated memory.
- **Multilingual support.** The bot communicates in the user's language. Provided by the language model without additional development.
- **Web search.** The bot performs web searches when it cannot answer from its own knowledge. Uses the LLM provider's built-in web search (tool/function calling). The LLM formulates the search query using relevant facts from memory (location, query context) to improve result accuracy.
- **Advisory Guardrails.** The bot provides helpful information on medical, legal, and financial questions, does not diagnose, and gently directs to a specialist when necessary.

### Platform and Data

- **Telegram bot.** The only interface. Private messages only (1:1).
- **Waitlist.** Access by application with manual approval.
- **Data isolation.** Strict separation between users (multi-tenant).
- **Account deletion.** Complete data deletion upon user request.
- **Pause and resume.** The user pauses the bot (`/stop`) — messages are not processed, data is preserved. Resume — `/start`.

---

## Out — Post-MVP

| Feature | Reason |
|---------|--------|
| Mobile app | Telegram is sufficient for value validation |
| Data export | Not critical for validation |
| Group chats | Complicates the data model and privacy |
| Proactive recommendations | Outside the product's positioning. Clarification questions from the memory system (save confirmation, interest suggestion) are not proactive recommendations |
| Web interface for memory management | Conversational interface is sufficient for MVP |
| Integrations (calendar, email, tasks) | Outside the product's focus |
| Monetization | Determined after value validation |
| Voice messages | Focus on text; voice adds complexity |
| Image and file processing | Focus on text-based context |
| Sleep-time memory consolidation | Value is realized after data accumulation (1–2 months post-launch) |
| Long session compaction | Semantic retrieval covers most scenarios |
| Sensitive data management | Category-level save controls (medical, financial, etc.) — reactive deletion via memory.delete is sufficient for MVP |
| Two-Stage Retrieval (Stage 2) | Value is realized after accumulating a significant volume of facts. Stage 1 (pgvector top-K) + User Summary are sufficient for MVP |

---

## Never

- Universal assistant (email, calendar, task manager)
- Digital twin / communicating on the user's behalf
- Memory journal for descendants
- API / platform for developers
- Autonomous agent (actions without explicit request, except for requested reminders)
- Sharing data with third parties

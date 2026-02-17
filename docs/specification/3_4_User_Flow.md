# 3.4 User Flow

## Conventions

- Diagrams describe the main flows (happy path) and key branching points.
- Negative and edge-case scenarios are covered in test cases (phase 6).
- Traceability to US and FR is indicated for each flow.

---

## Flow 1 · Onboarding

**Traceability:** US-ONB.1, US-ONB.2, US-REM.6

```mermaid
flowchart TD
    A[User writes to the bot] --> B{On waitlist?}
    B -->|Not approved| C[Message: you are in the queue]
    C --> D[End]
    B -->|Approved| E{First message?}
    E -->|Yes| F[Short welcome + usage example]
    F --> G[Process user message]
    E -->|No| G
    G --> H[Main loop — Flow 2]
```

**Notes:**

- Waitlist is the first barrier. An unapproved user receives a single message and cannot use the bot. The administrator approves manually.
- The welcome is sent once on the first message from an approved user. It contains one usage example, without instructions or tutorials.
- Timezone is not determined during onboarding — it is requested upon the first reminder creation (Flow 4).

---

## Flow 2 · Main Memory Loop

**Traceability:** US-MEM.1, US-MEM.2, US-MEM.3, US-MEM.5

```mermaid
flowchart TD
    A[User message] --> B[Extract facts from message]
    B --> C{Facts found?}
    C -->|No| D[Search for relevant facts in memory]
    C -->|Yes| E[Entity resolution and creation]
    E --> F{Conflict with existing fact?}
    F -->|Yes| G[Clarify with user]
    G --> H{User confirmed change?}
    H -->|Yes| I[Update fact, old → outdated]
    H -->|No| J[Save both facts]
    F -->|No| M[Save fact]
    I --> D
    J --> D
    M --> D
    D --> N[Generate response considering memory]
    N --> O[Response to user]
```

**Notes:**

- Every message goes through a fact extraction attempt. The LLM determines whether the message contains significant information.
- Entity resolution and creation (FR-MEM.3) happens before saving: the bot determines whether the fact relates to an existing entity or creates a new one.
- Conflict detection (FR-MEM.4) uses fact typing: "I work at Google" conflicts with "I work at Yandex" (type: workplace), but not with "I live in Berlin."
- Extraction and saving happen silently — the user only sees the final response enriched with memory context.

---

## Flow 3 · Memory Management

**Traceability:** US-MEM.6, US-MEM.7, US-MEM.8, US-MEM.9, US-MEM.10, US-MEM.13

```mermaid
flowchart TD
    A[User memory request] --> B{Request type?}
    B -->|View| C{Filter specified?}
    C -->|General| D[Summary of all facts in free form]
    C -->|By topic| E[Filter by topic → result]
    C -->|By time| F[Filter by time period → result]
    C -->|Combined| G[Filter by topic + time → result]
    B -->|Edit| H[Identify fact in memory]
    H --> I[Old fact → outdated, new → current]
    I --> J[Confirmation to user]
    B -->|Delete single fact| K[Identify fact]
    K --> L[Confirm deletion]
    L -->|Confirmed| M[Fact deleted]
    L -->|Canceled| N[Operation canceled]
    B -->|Delete entity| O[Identify related facts]
    O --> P[Separate: entity-only facts / facts with other links]
    P --> Q[Describe deletion scope]
    Q --> R[Confirmation]
    R -->|Confirmed| S[Entity links removed, entity-only facts deleted]
    R -->|Canceled| N
    B -->|Explain| T[Show source_quote and date of facts from last response]
```

**Notes:**

- Viewing adapts to volume: with a large number of facts (30+), the bot groups and summarizes instead of providing a full list.
- Editing always preserves history — the previous version is not lost but receives "outdated" status.
- Cascading deletion (FR-MEM.11) works through the FactEntity junction table. The bot must separate: (1) facts linked only to the entity being deleted → delete, (2) facts linked to other entities as well → remove only the link, (3) unrelated → leave untouched.
- Explanation (FR-MEM.13): the bot shows source_quote and date for facts used in the last response.

---

## Flow 4 · Reminders

**Traceability:** US-REM.1 – US-REM.6

```mermaid
flowchart TD
    A[Reminder request] --> B{Timezone determined?}
    B -->|No| C[Ask user for city]
    C --> D[LLM maps city to IANA timezone, city saved as fact]
    D --> E[Parse reminder time]
    B -->|Yes| E
    E --> F{Reference to memory fact?}
    F -->|Yes| G{Fact found?}
    G -->|Yes| H[Resolve reference → specific date]
    G -->|No| I[Clarify with user]
    I --> H
    F -->|No| H
    H --> J{Reminder type?}
    J -->|One-time| K[Create reminder]
    J -->|Recurring| L[Create with schedule]
    K --> M[Confirmation: time and text]
    L --> M

    N[Reminder management] --> NA{Multiple matches?}
    NA -->|Yes| NB[Numbered list → user selection]
    NB --> NC[Execute operation]
    NA -->|No| NC

    O[Reminder fires] --> P[Search for context in memory]
    P --> Q[Send: text + minimal context + help offer]
```

**Notes:**

- Timezone detection is lazy: requested only upon the first reminder, not during onboarding. Fallback — ask for the city, LLM maps city → IANA timezone, city saved as fact. Updated if the bot discovers a timezone change fact in memory (relocation, travel).
- Memory-based reminders (FR-REM.7): "Remind me 3 days before Dima's birthday" → the bot searches for the date in memory. If not found — asks the user, does not create the reminder "blindly."
- During reminder management: if the user's request (cancel, modify) matches multiple reminders — the bot shows a numbered list and asks to choose (AWAIT, type: missing_data).
- When a reminder fires, the bot enriches it with minimal context from memory and offers help (e.g., "Want me to draft a greeting?").

---

## Flow 5 · Account Deletion

**Traceability:** US-PLT.1

```mermaid
flowchart TD
    A[Data deletion request] --> B[Confirmation: irreversible operation]
    B --> C{User confirmed?}
    C -->|Yes| D[Delete all data: facts, reminders, profile, history]
    D --> E[Deletion confirmation]
    C -->|No| F[Operation canceled]
```

**Notes:**

- Immediate deletion without grace period. All data is deleted: facts, change history, reminders, profile, timezone.
- After deletion, the user can write to the bot again — they will enter the waitlist as a new user.

---

## Flow 6 · Administration

**Traceability:** US-ADM.1, US-ADM.2

```mermaid
flowchart TD
    A[System detects suspicious activity] --> B{Event type?}
    B -->|Prompt injection| C[Notification to administrator via Telegram]
    B -->|Rate limit exceeded| C
    B -->|Anomalous pattern| C
    C --> D[Administrator evaluates the situation]
    D --> E{Decision?}
    E -->|Block| F[Blocking command]
    F --> G[User blocked, messages not processed]
    E -->|Ignore| H[No action]

    I[Bot health monitoring] --> J{Bot alive?}
    J -->|No| K[Notification to administrator via Telegram]
    J -->|Yes| L[Check external services]
    L --> M{LLM API available?}
    M -->|No| K
    M -->|Yes| N[All clear]
```

**Notes:**

- All administrator notifications are sent via Telegram — a single channel for monitoring.
- Blocking is a manual administrator decision. There is no automatic blocking, only alerts.
- Health monitoring includes the bot's own availability and external dependencies (LLM API).

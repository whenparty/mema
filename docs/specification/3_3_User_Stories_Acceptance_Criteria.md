# 3.3 User Stories + Acceptance Criteria

## Conventions

- **Format:** As a [role], I want [goal], so that [benefit]
- **Acceptance Criteria:** Given / When / Then
- **Personas:** 👥 Socially active · 🤖 AI user · 🔄 In transition · 👶 Young parent
- **Numbering:** US-{block}.{number}, traceability to FR

---

## Epic 1 · Memory — Extraction and Storage

### US-MEM.1 · Automatic Fact Memorization
**FR:** FR-MEM.1, FR-MEM.2 · **Persona:** 👶 Young parent

> As a user, I want the bot to remember important facts from conversation without my commands, so that I don't spend effort on manual input.

**AC 1 — Fact extracted and saved**
- Given: the user sends a message "My son started daycare in September"
- When: the bot processes the message
- Then: the fact is saved with a type from the fixed set (`event`), creation date, event date (`event_date` = September of current year), source quote, and status "current"

**AC 2 — Extraction happens silently**
- Given: the bot extracted a fact from a message
- When: the fact is saved
- Then: the bot does not send a separate notification about memorization

**AC 3 — event_date is determined from context**
- Given: the user writes "We went to the doctor yesterday"
- When: the bot processes the message
- Then: `event_date` is set to yesterday's date, not the message date

**AC 4 — event_date fallback**
- Given: the user writes "I love Italian food" (no date specified)
- When: the bot processes the message
- Then: `event_date` = `created_at` (message date)

---

### US-MEM.11 · Explicit Fact Saving by Request
**FR:** FR-MEM.1, FR-MEM.2 · **Persona:** 👥 Socially active

> As a user, I want to explicitly ask the bot to remember a fact and receive confirmation, so that I'm confident the important information is saved.

**AC 1 — Fact saved with confirmation**
- Given: the user writes "Remember that Dima's birthday is March 15"
- When: the bot processes the message
- Then: the fact is saved (with type, creation date, `event_date`, source quote, status "current"), the bot confirms the save indicating the essence of the fact

---

### US-MEM.2 · Entity Resolution
**FR:** FR-MEM.3 · **Persona:** 👥 Socially active

> As a user, I want the bot to understand that "Misha", "Mishka", and "my friend" are the same person, so that facts are not duplicated.

**AC 1 — Different name forms**
- Given: the entity "Misha, friend" exists in memory
- When: the user writes "Mishka moved to Berlin"
- Then: the fact is linked to the existing entity "Misha", not creating a new one

**AC 2 — Contextual reference**
- Given: the user mentioned Dima in the current conversation
- When: the user writes "He works in fintech"
- Then: the fact is linked to the entity "Dima"

**AC 3 — Fact with multiple entities**
- Given: entities "Dima" and "Misha" exist in memory
- When: the user writes "Went skiing with Dima and Misha"
- Then: the fact is linked to both entities via the junction table

---

### US-MEM.3 · Conflict Detection
**FR:** FR-MEM.4 · **Persona:** 🔄 In transition

> As a user, I want the bot to notice contradictions in facts and clarify what changed, so that memory stays current.

**AC 1 — Explicit update: bot silently updates the fact**
- Given: the fact "user lives in Berlin" is saved in memory
- When: the user writes "I moved to Munich"
- Then: the old fact is marked as outdated, the new one is saved as current. The bot does not ask a clarifying question

**AC 2 — Implicit contradiction: bot clarifies**
- Given: the fact "user lives in Berlin" is saved in memory
- When: the user writes "I'm in Munich right now, working on a project here"
- Then: the bot clarifies: "Did you move from Berlin or are you on a business trip?"

**AC 3 — User confirms the change**
- Given: the bot asked a clarifying question about a contradiction
- When: the user confirms the change
- Then: the old fact is marked as outdated, the new one is saved as current

**AC 4 — User denies the change**
- Given: the bot asked a clarifying question about a contradiction
- When: the user responds "No, I'm on a business trip"
- Then: both facts are saved as current with corresponding context

**AC 5 — Facts of different types do not conflict**
- Given: the fact "user lives in Berlin" is saved in memory
- When: the user writes "I'm looking at apartments in Munich"
- Then: the new fact is saved without conflict, the bot does not ask a clarifying question

**AC 6 — Coexistence: parallel facts**
- Given: the bot asked a clarifying question about a workplace contradiction
- When: the user explains coexistence ("Google is the main job, Yandex is a side gig")
- Then: both facts are updated with qualifiers in content, both saved as active

**AC 7 — Coexistence: opinion evolution**
- Given: the fact "doesn't want to go back to Russia" is in memory
- When: the user writes "thinking maybe I should go back, it's lonely without family"
- Then: the new fact is saved as active alongside the old one, the bot does not ask a clarifying question

---

### US-MEM.14 · Interest Detection from Query Patterns
**FR:** FR-MEM.15 · **Persona:** 🤖 AI user

> As a user, I want the bot to notice my recurring interests and offer to remember them, so that I don't need to explicitly state my hobbies.

**AC 1 — Interest detected and offered**
- Given: the user has asked ≥ 3 questions about "dinosaurs" in the last 20 chat messages
- When: the user asks another question on this topic
- Then: the bot answers the question and at the end of the response asks "I notice you're interested in dinosaurs 🦕 Save it as an interest?"

**AC 2 — User confirms**
- Given: the bot offered to save an interest
- When: the user confirms
- Then: a fact with `fact_type: preference` is created, the candidate is marked as `confirmed`

**AC 3 — User declines**
- Given: the bot offered to save an interest
- When: the user declines
- Then: the candidate is marked as `dismissed`, the bot no longer offers this topic

**AC 4 — Inline question does not break the main response**
- Given: the bot detected a promoted interest
- When: the user asks a question on this topic
- Then: the bot first fully answers the question, then adds the interest suggestion

---

## Epic 2 · Memory — Application and Search

### US-MEM.5 · Applying Memory in Responses
**FR:** FR-MEM.6 · **Persona:** 🤖 AI user

> As a user, I want the bot to use saved facts when responding, so that I don't have to explain context again.

**AC 1 — Memory applied implicitly**
- Given: the fact "user lives in Munich" is saved in memory
- When: the user asks "Where to eat sushi?"
- Then: the bot recommends sushi restaurants in Munich without asking for the city

---

### US-MEM.6 · Viewing Memory
**FR:** FR-MEM.7 · **Persona:** 🤖 AI user

> As a user, I want to see what the bot has remembered about me, so that I can verify correctness.

**AC 1 — General view**
- Given: facts about the user have accumulated in memory
- When: the user asks "What do you know about me?"
- Then: the bot responds in a free conversational form, grouping and summarizing information

**AC 2 — Large volume of facts**
- Given: there are more than 30 facts in memory
- When: the user requests a general view
- Then: the bot provides a summary by categories without overloading with a long list

---

### US-MEM.7 · Search by Topic and Time
**FR:** FR-MEM.8 · **Persona:** 👶 Young parent

> As a user, I want to find facts by topic or time period, so that I can quickly get the information I need.

**AC 1 — Search by topic**
- Given: there are facts about the user's work in memory
- When: the user asks "What do you remember about my job?"
- Then: the bot provides only facts related to work

**AC 2 — Search by time (event_date)**
- Given: there are facts with different `event_date` values in memory
- When: the user asks "What did I tell you in January?"
- Then: the bot provides facts whose `event_date` falls in January

**AC 3 — Combined search**
- Given: there are facts about the son from different months in memory
- When: the user asks "What happened with my son in the fall?"
- Then: the bot provides facts about the son with `event_date` in September–November

---

### US-MEM.12 · Viewing Fact Change History
**FR:** FR-MEM.2a · **Persona:** 🔄 In transition

> As a user, I want to see the change history of a specific fact, so that I understand how the information evolved.

**AC 1 — History available**
- Given: the fact "lives in Munich" has a previous version "lives in Berlin"
- When: the user asks about the change history
- Then: the bot shows the version chain with change dates

---

### US-MEM.13 · Explaining Knowledge Source
**FR:** FR-MEM.13 · **Persona:** 🤖 AI user

> As a user, I want to understand where the bot got its information, so that I can verify correctness.

**AC 1 — Source shown**
- Given: the bot just gave a response using memory
- When: the user asks "How do you know that?"
- Then: the bot shows source_quote and date for each fact used in the last response

**AC 2 — Without context**
- Given: the bot responded without using memory
- When: the user asks "How do you know that?"
- Then: the bot states it responded based on general knowledge, without facts from memory

---

## Epic 3 · Memory — Editing and Deletion

### US-MEM.8 · Editing Facts
**FR:** FR-MEM.9 · **Persona:** 🔄 In transition

> As a user, I want to correct remembered facts through conversation, so that memory stays current.

**AC 1 — Fact updated with history preserved**
- Given: the fact "user lives in Berlin" is saved in memory
- When: the user writes "I moved from Berlin to Munich"
- Then: the old fact is marked as outdated, the new one is saved as current, change history is available

---

### US-MEM.9 · Deleting Facts
**FR:** FR-MEM.10 · **Persona:** 🤖 AI user

> As a user, I want to delete specific facts from memory, so that I control what the bot knows.

**AC 1 — Deletion with confirmation**
- Given: a fact is saved in memory
- When: the user asks "Forget that I live in Berlin"
- Then: the bot confirms deletion before executing
- When: the user confirms
- Then: the fact is deleted

---

### US-MEM.10 · Cascading Entity Deletion
**FR:** FR-MEM.11 · **Persona:** 👥 Socially active

> As a user, I want to delete everything about a specific person while preserving facts about me personally.

**AC 1 — Cascading deletion with separation**
- Given: memory contains facts "Dima lives in Berlin", "Dima works in fintech", "Went skiing with Dima"
- When: the user writes "Forget everything about Dima"
- Then: the bot lists the deletion scope and requests confirmation
- When: the user confirms
- Then: facts linked only to Dima are deleted. The fact "went skiing" is preserved — the link to Dima is removed via the junction table

---

## Epic 4 · Reminders

### US-REM.1 · One-Time Reminder
**FR:** FR-REM.1 · **Persona:** 👥 Socially active

> As a user, I want to set a reminder in natural language, so that I don't forget something important.

**AC 1 — Reminder by relative time**
- Given: the user writes "Remind me in half an hour to call mom"
- When: the bot processes the request
- Then: the reminder is created, the bot confirms the trigger time

**AC 2 — Reminder by absolute time**
- Given: the user writes "Remind me tomorrow at 9 am about the meeting"
- When: the bot processes the request
- Then: the reminder is created accounting for the user's IANA timezone

**AC 3 — Reminder delivery**
- Given: the trigger time has arrived
- When: the bot sends the reminder
- Then: the user receives a message with the reminder text

---

### US-REM.2 · Recurring Reminder
**FR:** FR-REM.2 · **Persona:** 🤖 AI user

> As a user, I want to set a recurring reminder with a complex schedule, so that I automate routine tasks.

**AC 1 — Simple recurrence**
- Given: the user writes "Remind me every Monday at 10:00 about the report"
- When: the bot processes the request
- Then: a recurring reminder is created, the bot confirms the schedule

**AC 2 — Complex pattern**
- Given: the user writes "Remind me every third Thursday of the month about payment"
- When: the bot processes the request
- Then: a reminder with the correct schedule is created

---

### US-REM.3 · Context in Reminders
**FR:** FR-REM.3 · **Persona:** 👥 Socially active

> As a user, I want the reminder to contain context from memory, so that I immediately understand the situation.

**AC 1 — Reminder with context and help offer**
- Given: memory contains "Dima, birthday March 15, 35 years old, lives in Berlin"
- When: the reminder "Congratulate Dima" fires
- Then: the bot sends "Happy birthday to Dima! He's turning 35, lives in Berlin. Want me to draft a greeting?"

---

### US-REM.4 · Reminder Management
**FR:** FR-REM.4 · **Persona:** 🤖 AI user

> As a user, I want to view, cancel, and modify reminders through dialog.

**AC 1 — View active reminders**
- Given: the user has active reminders
- When: the user asks "What reminders do I have?"
- Then: the bot displays the list in a human-readable format

**AC 2 — Cancel a reminder**
- Given: the user has an active reminder
- When: the user writes "Cancel the reminder about the report"
- Then: the bot cancels and confirms

**AC 3 — Disambiguation with multiple matches**
- Given: the user has 3 reminders with "report" in the text
- When: the user writes "Cancel the reminder about the report"
- Then: the bot shows a numbered list of matches and asks the user to choose

---

### US-REM.5 · Memory-Based Reminder
**FR:** FR-REM.7 · **Persona:** 👥 Socially active

> As a user, I want to create reminders by referencing facts from memory, without re-entering dates.

**AC 1 — Date found in memory**
- Given: the fact "Dima's birthday — March 15" is saved in memory
- When: the user writes "Remind me 3 days before Dima's birthday"
- Then: the bot creates a reminder for March 12

**AC 2 — Date not found in memory**
- Given: Dima's birthday date is not in memory
- When: the user writes "Remind me 3 days before Dima's birthday"
- Then: the bot asks for the date

---

### US-REM.6 · Timezone Detection
**FR:** FR-REM.6 · **Persona:** 🔄 In transition

> As a user, I want the bot to determine my timezone once, so that reminders arrive at the correct time.

**AC 1 — Detection by city from memory**
- Given: the timezone is not determined, memory contains the fact "lives in Munich"
- When: the user first requests to set a reminder
- Then: the bot maps "Munich" → `Europe/Berlin`, saves the IANA timezone

**AC 2 — Fallback: request city**
- Given: the timezone is not determined, the city is not in memory
- When: the user first requests to set a reminder
- Then: the bot asks for the city, the LLM maps it to an IANA zone, the city is saved as a fact

**AC 3 — Timezone update from context**
- Given: a fact about moving to a different timezone appeared in memory
- When: the bot detects a potential timezone change
- Then: the bot clarifies the user's current city

---

## Epic 5 · Communication

### US-COM.1 · Contextual Responses
**FR:** FR-COM.1, FR-COM.5 · **Persona:** 🤖 AI user

> As a user, I want the bot to personalize responses based on memory, so that I receive relevant advice.

**AC 1 — Memory takes priority**
- Given: "user is a vegetarian" is saved in memory
- When: the user asks "What should I cook for dinner?"
- Then: the bot recommends vegetarian dishes without additional questions

---

### US-COM.2 · General Question Responses
**FR:** FR-COM.2, FR-COM.5 · **Persona:** 🤖 AI user

> As a user, I want to ask general questions and receive useful answers, even if they are not related to memory.

**AC 1 — General question without memory context**
- Given: the user asks "Explain quantum computing"
- When: the bot processes the request
- Then: the bot responds using general knowledge

**AC 2 — Question with internet search**
- Given: the user asks about current events
- When: the bot does not have up-to-date information
- Then: the bot performs a search via the LLM provider's built-in web search and responds based on the results. The LLM uses relevant facts from memory (location, context) to formulate the search query

---

### US-COM.3 · Contextual Clarifications
**FR:** FR-COM.4 · **Persona:** 🔄 In transition

> As a user, I want the bot to only ask about location if it doesn't know it, so that I don't answer unnecessary questions.

**AC 1 — Location known**
- Given: the user's city is saved in memory
- When: the user asks "What's the weather today?"
- Then: the bot responds for the saved city

**AC 2 — Location unknown**
- Given: the user's city is not in memory
- When: the user asks "What's the weather today?"
- Then: the bot asks for the city

---

## Epic 6 · Onboarding

### US-ONB.1 · New User Welcome
**FR:** FR-ONB.1 · **Persona:** all

> As a new user, I want to receive a short clear welcome, so that I can start using the bot right away.

**AC 1 — First message**
- Given: the user is approved and writes to the bot for the first time
- When: the bot receives the first message
- Then: the bot sends a short welcome with one usage example, without long instructions

---

### US-ONB.2 · Waitlist
**FR:** FR-ONB.2 · **Persona:** all

> As an unapproved user, I want to understand that I'm in the queue, so that I don't think the bot is broken.

**AC 1 — User in queue**
- Given: the user is not approved
- When: the user writes to the bot
- Then: the bot responds with a message about being in the queue

---

## Epic 7 · Platform and Data

### US-PLT.1 · Account Deletion
**FR:** FR-PLT.3 · **Persona:** all

> As a user, I want to completely delete my data, so that I control my privacy.

**AC 1 — Deletion with confirmation**
- Given: the user writes "Delete all my data"
- When: the bot requests confirmation
- Then: upon confirmation — all data is immediately deleted from the database, the bot confirms deletion. Data may persist in backups for up to 7 days

---

### US-PLT.2 · Rate Limiting and Token Quota
**FR:** FR-PLT.4, NFR-SEC.2 · **Persona:** all

> As a user, I want to receive a warning when the limit is exceeded, so that I understand why the bot stopped responding.

**AC 1 — Rate limit exceeded**
- Given: the user sent 100 messages in an hour
- When: the user sends the next message
- Then: the bot responds with a warning and stops processing until the next hour

**AC 2 — Token quota exhausted**
- Given: the user exhausted the monthly token quota
- When: the user sends a message
- Then: the bot responds with a warning about reaching the limit with the renewal date, the administrator receives a notification

---

### US-PLT.3 · Pause and Resume
**FR:** FR-PLT.5 · **Persona:** all

> As a user, I want to pause the bot and come back later, so that my data is preserved but the bot doesn't process messages.

**AC 1 — Pause via /stop**
- Given: the user sends the `/stop` command
- When: the bot processes the command
- Then: user status → `paused`, the bot confirms the pause, messages are no longer processed

**AC 2 — Reminders are not delivered during pause**
- Given: the user is paused
- When: the reminder trigger time arrives
- Then: the reminder is skipped without delivery. One-time — marked as `delivered`, recurring — recalculate `next_trigger_at`

**AC 3 — Resume via /start**
- Given: the paused user sends `/start`
- When: the bot processes the command
- Then: user status → `active`, the bot confirms resumption, all data is preserved

---

## Epic 8 · Administration

### US-ADM.1 · Suspicious Activity Notifications
**NFR:** NFR-SEC.4, NFR-OBS.2 · **Persona:** administrator

> As an administrator, I want to receive notifications about suspicious activity, so that I can respond in a timely manner.

**AC 1 — Notification on suspicious activity**
- Given: the system detected anomalous user behavior (prompt injection, rate limit violation)
- When: the event is recorded
- Then: the administrator receives a Telegram notification describing the incident

---

### US-ADM.2 · User Blocking
**NFR:** NFR-SEC.4 · **Persona:** administrator

> As an administrator, I want to block a user, so that the system is protected from abuse.

**AC 1 — Manual blocking**
- Given: the administrator decided to block a user
- When: the administrator executes the blocking command
- Then: the user is blocked, their messages are not processed

---

## Traceability

| US | FR / NFR |
|---|---|
| US-MEM.1 | FR-MEM.1, FR-MEM.2 |
| US-MEM.11 | FR-MEM.1, FR-MEM.2 |
| US-MEM.2 | FR-MEM.3 |
| US-MEM.3 | FR-MEM.4 |
| US-MEM.5 | FR-MEM.6 |
| US-MEM.6 | FR-MEM.7 |
| US-MEM.7 | FR-MEM.8 |
| US-MEM.8 | FR-MEM.9 |
| US-MEM.9 | FR-MEM.10 |
| US-MEM.10 | FR-MEM.11 |
| US-MEM.12 | FR-MEM.2a |
| US-MEM.13 | FR-MEM.13 |
| US-MEM.14 | FR-MEM.15 |
| US-REM.1 | FR-REM.1 |
| US-REM.2 | FR-REM.2 |
| US-REM.3 | FR-REM.3 |
| US-REM.4 | FR-REM.4 |
| US-REM.5 | FR-REM.7 |
| US-REM.6 | FR-REM.6 |
| US-COM.1 | FR-COM.1, FR-COM.5 |
| US-COM.2 | FR-COM.2, FR-COM.5 |
| US-COM.3 | FR-COM.4 |
| US-ONB.1 | FR-ONB.1 |
| US-ONB.2 | FR-ONB.2 |
| US-PLT.1 | FR-PLT.3 |
| US-PLT.2 | FR-PLT.4, NFR-SEC.2 |
| US-PLT.3 | FR-PLT.5 |
| US-ADM.1 | NFR-SEC.4, NFR-OBS.2 |
| US-ADM.2 | NFR-SEC.4 |

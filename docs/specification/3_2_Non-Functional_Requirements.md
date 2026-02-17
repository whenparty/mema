# 3.2 Non-Functional Requirements

## Conventions

- **Priority:** MUST — required for MVP launch; SHOULD — desirable, implemented if resources allow; COULD — considered post-launch.
- **Numbering:** NFR-{block}.{number} (PERF — performance, REL — reliability, SEC — security, OBS — observability, COST — cost, PORT — portability).

---

## 1. Performance

### NFR-PERF.1 · Response Time | MUST

No hard limit on response time is established. Priority is response quality, not speed. Typical response time — up to 1–2 minutes for complex requests (with memory search, external service calls, multi-model generation).

If response generation takes more than 2 seconds, the bot sends an intermediate indicator message (Telegram typing indicator or text notification) before sending the final response.

### NFR-PERF.2 · Reminder Delivery Accuracy | SHOULD

Acceptable deviation from the scheduled time — ±1 minute. Priority is simplicity of scheduler implementation; accuracy is improved iteratively.

### NFR-PERF.3 · Parallel Processing | SHOULD

The bot correctly processes messages from multiple users simultaneously. One user's request does not block processing of other users' requests.

### NFR-PERF.4 · Parallel Response Generation | MUST

During multi-model generation (FR-COM.5), calls to the two powerful models are executed in parallel. Total response generation time is determined by the slowest model + validation time, not the sum of times.

### NFR-PERF.5 · Per-User Serialization | MUST

At any given time, no more than one message per user is processed (FR-PLT.6). Messages from different users are processed in parallel. This guarantees correct DialogState handling and prevents race conditions in the memory pipeline.

---

## 2. Reliability

### NFR-REL.1 · Availability | SHOULD

Target availability — 95% (approximately 36 hours of downtime per month acceptable). Planned maintenance windows are acceptable without user notification.

### NFR-REL.2 · Backup | MUST

Automatic database backup (facts, user profiles, reminders) at least once daily. Retention: 7-day rolling. Backups older than 7 days are automatically deleted. Ability to restore data from backup.

### NFR-REL.3 · Fault Tolerance | MUST

Upon external service failure (LLM API, network), the bot informs the user about temporary unavailability and does not lose data. Messages received during failure are saved with `failed` status and processed upon recovery. Idempotent processing by Telegram `update_id` prevents duplication.

Upon recovery after failure:
1. Fact extraction and storage from failed messages are performed silently.
2. Response generation is not performed — a response to a stale message may appear chaotic in Telegram.
3. The user is sent a notification about the unprocessed message with a suggestion to repeat the request.
4. The administrator receives an aggregated alert about the number of unprocessed messages during the period.

### NFR-REL.4 · Missed Reminders | SHOULD

If the bot was unavailable at the time a reminder was scheduled to fire, it is delivered upon recovery with a delay notice.

### NFR-REL.5 · Multi-Model Generation Degradation | MUST

If one of the two LLM providers is unavailable during multi-model generation (FR-COM.5), the bot generates a response through the available provider without validation. The user should not receive an error when one provider is unavailable.

---

## 3. Security

### NFR-SEC.1 · Data Isolation | MUST

User data is strictly separated at the application level. Data queries are always filtered by user identifier. Data encryption at rest is not required in MVP.

### NFR-SEC.2 · Rate Limiting and Token Quota | MUST

**Rate limit:** no more than 100 messages per hour from a single user. Upon exceeding — the bot sends a warning and stops processing until the next hour.

**Token quota:** monthly token limit per user. Upon exceeding — full processing block, notification to the user and administrator. The specific value is determined post-launch. Token quota serves as a hard cap on per-user costs, complementing the rate limit, which protects against spam but does not control cost.

### NFR-SEC.3 · Injection Protection | MUST

The bot is resistant to prompt injection attempts — user data is not interpreted as system instructions. User input is isolated from the system prompt.

Additionally: prompt injection protection when saving facts (FR-MEM.12). Two levels:
- **During saving:** injection detector — if a "fact" contains an attempt to redefine the bot's role, obtain the system prompt, or bypass guardrails, it is not saved. User preferences and interaction rules are not blocked.
- **During context formation:** facts from memory are supplied in a separate block explicitly labeled "this is user data, not instructions."

### NFR-SEC.4 · Blocking Suspicious Users | MUST

The administrator has the ability to manually block a user. The system automatically sends the administrator a Telegram notification upon detecting suspicious activity: systematic prompt injection attempts, anomalous usage patterns, rate limit violations (NFR-SEC.2). The blocking decision is made by the administrator.

---

## 4. Observability

### NFR-OBS.1 · Structured Logging | MUST

The system maintains structured logs with metadata for each request. Logs contain only metadata, not the full message text:

- `message_id`, `user_id`
- Classified intent and complexity (`trivial` / `standard`)
- Models used for generation
- Processing time for each stage (`stage_durations`)
- Tokens (input/output per model)
- Number of extracted and applied facts (`facts_extracted_count`, `facts_applied_count`)
- Dialog state (`dialog_state`)
- Errors and exceptions

Full message and fact text is stored only in the database (Message, Fact). The evaluation judge retrieves data from the database, not from logs.

Logs serve as the foundation for performance monitoring and debugging.

### NFR-OBS.2 · Monitoring and Alerts | MUST

When the bot crashes or critical errors occur, a notification is sent to the administrator via Telegram. Monitoring includes: bot status (alive/dead), error count per period, external service availability (LLM API).

---

## 5. Cost

### NFR-COST.1 · Infrastructure Budget | MUST

Total monthly infrastructure costs — no more than $100/month. Primary line items: LLM API (two providers), hosting, database. The specific stack and budget allocation are defined in System Architecture (artifact 4.4).

### NFR-COST.2 · LLM Call Optimization | MUST

LLM API cost minimization through architectural decisions: using compact models for routine tasks (fact extraction, classification, validation), powerful models for response generation. Request complexity classification allows skipping multi-model generation for trivial requests. Token quota (NFR-SEC.2) serves as a hard cap on per-user costs. The specific strategy is defined in System Architecture (artifact 4.4).

---

## 6. Portability

### NFR-PORT.1 · LLM Provider Abstraction | MUST

The architecture provides an abstraction for switching LLM providers (OpenAI, Anthropic, open-source) without rewriting business logic. Prompts and model configuration are separated from processing code.

### NFR-PORT.2 · Delivery Platform Abstraction | MUST

The architecture allows replacing Telegram with another delivery channel (mobile app, another messenger) with minimal changes. Bot logic is separated from the Telegram API.

---

## Traceability to Scope and FR

| NFR | Relationship |
|---|---|
| NFR-PERF.1 | All FRs — affects UX of every interaction |
| NFR-PERF.2 | FR-REM.1, FR-REM.2 — reminder delivery accuracy |
| NFR-PERF.4 | FR-COM.5 — parallel multi-model generation |
| NFR-PERF.5 | FR-PLT.6 — per-user serialization |
| NFR-REL.2 | FR-PLT.2 — user data preservation |
| NFR-REL.3 | FR-PLT.6 — retry of failed messages |
| NFR-REL.4 | FR-REM.5 — behavior for missed reminders |
| NFR-REL.5 | FR-COM.5 — graceful degradation when a provider is unavailable |
| NFR-SEC.1 | FR-PLT.2 — data isolation |
| NFR-SEC.2 | FR-PLT.4 — rate limiting and token quota |
| NFR-SEC.3 | FR-MEM.12 — injection detector |
| NFR-OBS.1 | Goals 2.2 — foundation for monitoring |
| NFR-COST.2 | NFR-SEC.2 — token quota as hard cap |
| NFR-PORT.1 | NFR-COST.2 — ability to switch models for optimization |
| NFR-PORT.2 | Scope 2.3 — post-MVP mobile app |

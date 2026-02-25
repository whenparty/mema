# Gateway: Telegram

## Purpose

Telegram delivery channel adapter using grammy. Receives messages via long polling,
extracts platform-agnostic input, and delegates to a `MessageHandler` callback
(the pipeline, once implemented). Enforces FR-PLT.1 (private chats only) and
NFR-PORT.2 (Telegram-specific logic isolated from business logic).

## Key Files

- `bot.ts` — Factory `createTelegramBot(config)` that wires middleware, commands, text handler, and error handler. Returns `{ start, stop }`.
- `types.ts` — Gateway interfaces: `TelegramMessageInput`, `MessageHandler`, `TelegramBotConfig`, `TelegramBotInstance`.
- `middleware/private-only.ts` — Drops non-private chat updates (groups, channels).
- `middleware/user-serializer.ts` — Per-user message serialization middleware (FR-PLT.6). Ensures at most one message per user is processed at a time using promise chaining.
- `middleware/dedup-guard.ts` — Idempotent processing middleware (NFR-REL.3). Checks if a Telegram update has already been processed via injected `DuplicateChecker`. Skips duplicates with a warning log.
- `commands/start.ts` — `/start` command handler (stub).
- `commands/help.ts` — `/help` command handler (stub).
- `commands/stop.ts` — `/stop` command handler (stub).

## Interfaces

- `TelegramMessageInput` — Exported from `types.ts`. Platform-agnostic representation of an incoming text message.
- `MessageHandler` — Exported from `types.ts`. Callback `(input: TelegramMessageInput) => Promise<string>`. The gateway calls this for every text message; the return value is sent as the reply.
- `TelegramBotConfig` — Exported from `types.ts`. Configuration for `createTelegramBot`: `{ token, onMessage, isDuplicate? }`.
- `TelegramBotInstance` — Exported from `types.ts`. Returned by `createTelegramBot`: `{ start(), stop() }`.
- `DuplicateChecker` — Exported from `types.ts`. `(telegramUserId: string, updateId: number) => Promise<boolean>`. Injected into bot config for idempotency checks.
- `UserSerializer` — Exported from `middleware/user-serializer.ts`. `{ middleware, pendingCount }` returned by `createUserSerializer()`.
- `DedupGuard` — Exported from `middleware/dedup-guard.ts`. `{ middleware }` returned by `createDedupGuard(isDuplicate)`.

## Patterns & Decisions

- **Long polling only** (TASK-0.11 decision): `bot.start()` is fire-and-forget (never-resolving promise); `.catch()` logs polling crashes.
- **Factory + DI**: `createTelegramBot` takes a config with the message handler callback. The gateway never imports infra — the caller (app.ts) wires dependencies.
- **Private-only middleware**: Registered first via `bot.use()`, silently drops group/supergroup/channel updates.
- **Per-user serialization middleware**: Registered after private-only via `bot.use()`. Uses a `Map<string, Promise<void>>` to chain messages per user — each new message from the same user awaits the previous one's completion before calling `next()`. Messages from different users run in parallel. Lock is released in a `finally` block, ensuring chain recovery on errors. Cleanup removes the map entry when the last message completes. Full parallelism across users would require `@grammyjs/runner` (future enhancement for production scale).
- **Dedup guard middleware**: Registered after user-serializer via `bot.use()`. Calls `isDuplicate(telegramUserId, updateId)` — an injected `DuplicateChecker` function. If the update was already processed, logs a warning and returns without calling `next()`. Combined with user-serializer, concurrent duplicates are also caught because they are serialized first, then checked.
- **Middleware order**: `private-only` -> `user-serializer` -> `dedup-guard`. This ensures dedup checks happen within the serialized per-user context, preventing race conditions on concurrent duplicate delivery.
- **Error handler**: `bot.catch()` logs errors via child logger; does not crash the process.
- **Commands are stubs**: `/start`, `/help`, `/stop` send static placeholder text. Real logic in later tasks.
- **`telegramUserId` is a string**: Telegram user IDs are numbers, but stored as strings (matches `external_id` in UserAuth). Explicit `.toString()` conversion in the text handler.

## Dependencies

- imports from: `shared` (logger)
- imported by: `app.ts` (wired at startup)
- external: `grammy`

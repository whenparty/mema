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
- `commands/start.ts` — `/start` command handler (stub).
- `commands/help.ts` — `/help` command handler (stub).
- `commands/stop.ts` — `/stop` command handler (stub).

## Interfaces

- `TelegramMessageInput` — Exported from `types.ts`. Platform-agnostic representation of an incoming text message.
- `MessageHandler` — Exported from `types.ts`. Callback `(input: TelegramMessageInput) => Promise<string>`. The gateway calls this for every text message; the return value is sent as the reply.
- `TelegramBotConfig` — Exported from `types.ts`. Configuration for `createTelegramBot`: `{ token, onMessage }`.
- `TelegramBotInstance` — Exported from `types.ts`. Returned by `createTelegramBot`: `{ start(), stop() }`.

## Patterns & Decisions

- **Long polling only** (TASK-0.11 decision): `bot.start()` is fire-and-forget (never-resolving promise); `.catch()` logs polling crashes.
- **Factory + DI**: `createTelegramBot` takes a config with the message handler callback. The gateway never imports infra — the caller (app.ts) wires dependencies.
- **Private-only middleware**: Registered first via `bot.use()`, silently drops group/supergroup/channel updates.
- **Error handler**: `bot.catch()` logs errors via child logger; does not crash the process.
- **Commands are stubs**: `/start`, `/help`, `/stop` send static placeholder text. Real logic in later tasks.
- **`telegramUserId` is a string**: Telegram user IDs are numbers, but stored as strings (matches `external_id` in UserAuth). Explicit `.toString()` conversion in the text handler.

## Dependencies

- imports from: `shared` (logger)
- imported by: `app.ts` (wired at startup)
- external: `grammy`

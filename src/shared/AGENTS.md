# shared

## Purpose
Cross-cutting utilities used by all modules. Leaf module -- must not import from domain, infra, gateway, or pipeline.

## Key Files
- `env.ts` -- Zod-based environment validation, typed AppEnv/LlmModels exports, initEnv/getEnv/getLlmModels
- `logger.ts` -- Pino-based structured JSON logger, child logger factories, request logging middleware
- `errors.ts` -- (TODO) Error types and error handling utilities
- `types.ts` -- (TODO) Shared type definitions

## Interfaces
- `AppEnv` -- Typed environment object with camelCase fields (databaseUrl, port, logLevel, etc.)
- `LlmModels` -- Typed LLM model names (compact, powerfulA, powerfulB, validator, embedding)
- `validateEnv(envRecord?)` -- Validates env record against Zod schema, returns AppEnv (throws on failure)
- `initEnv(envRecord?)` -- Validates and caches env; call once at startup before server listen/migrations
- `getEnv()` -- Returns cached AppEnv (throws if initEnv not called)
- `getLlmModels()` -- Reads LLM model vars from process.env on each call (not cached, swappable at runtime)
- `resetEnvForTesting()` -- Clears cached env (test-only)
- `logger` -- Pre-configured pino instance (named "mema", JSON output, LOG_LEVEL from env)
- `createLoggerInstance(level?)` -- Creates a new pino logger instance with optional level override
- `createChildLogger(bindings)` -- Creates child logger with module/context bindings
- `createRequestLogger(requestId)` -- Creates child logger with request ID correlation
- `createRequestLoggingMiddleware(customLogger?)` -- Elysia plugin for automatic request/response logging

## Patterns & Decisions
- Environment validated at startup via Zod schema before server listen or migrations
- `initEnv()`/`getEnv()` singleton pattern -- avoids module-level side effects, testable
- LLM model vars read from process.env on each `getLlmModels()` call -- swappable without restart
- Sensitive keys (DATABASE_URL, API keys) never included in validation error messages
- TZ!=UTC triggers console.warn (logger may not be ready at validation time)
- Docker-only vars (POSTGRES_*, B2_*, DB_PORT) excluded from Zod schema
- Structured JSON logging to stdout (NFR-OBS.1)
- Log level controlled by `LOG_LEVEL` env var, default `info`
- Logs must contain only metadata, never full message text
- Request ID (UUID) generated per HTTP request for correlation
- Child loggers used for per-module and per-request context
- Elysia plugin uses `.as("global")` to propagate hooks to parent scope
- Request timing tracked via Map keyed by Request object
- Pipeline-specific NFR-OBS.1 metadata (message_id, user_id, intent, complexity, models, stage_durations, tokens, facts counts, dialog_state) and per-level usage (debug for LLM details, warn for rate limits, etc.) are deferred to TASK-4.1 (Pipeline orchestrator). This module provides the infrastructure only.

## Dependencies
- imports from: pino, elysia, zod
- imported by: all other modules (infra, domain, gateway, pipeline), app.ts (initEnv at startup)

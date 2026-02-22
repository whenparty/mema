# shared

## Purpose
Cross-cutting utilities used by all modules. Leaf module -- must not import from domain, infra, gateway, or pipeline.

## Key Files
- `logger.ts` -- Pino-based structured JSON logger, child logger factories, request logging middleware
- `errors.ts` -- (TODO) Error types and error handling utilities
- `types.ts` -- (TODO) Shared type definitions

## Interfaces
- `logger` -- Pre-configured pino instance (named "mema", JSON output, LOG_LEVEL from env)
- `createLoggerInstance(level?)` -- Creates a new pino logger instance with optional level override
- `createChildLogger(bindings)` -- Creates child logger with module/context bindings
- `createRequestLogger(requestId)` -- Creates child logger with request ID correlation
- `createRequestLoggingMiddleware(customLogger?)` -- Elysia plugin for automatic request/response logging

## Patterns & Decisions
- Structured JSON logging to stdout (NFR-OBS.1)
- Log level controlled by `LOG_LEVEL` env var, default `info`
- Logs must contain only metadata, never full message text
- Request ID (UUID) generated per HTTP request for correlation
- Child loggers used for per-module and per-request context
- Elysia plugin uses `.as("global")` to propagate hooks to parent scope
- Request timing tracked via Map keyed by Request object
- Pipeline-specific NFR-OBS.1 metadata (message_id, user_id, intent, complexity, models, stage_durations, tokens, facts counts, dialog_state) and per-level usage (debug for LLM details, warn for rate limits, etc.) are deferred to TASK-4.1 (Pipeline orchestrator). This module provides the infrastructure only.

## Dependencies
- imports from: pino, elysia
- imported by: all other modules (infra, domain, gateway, pipeline)

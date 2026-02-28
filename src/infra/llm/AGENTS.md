# LLM Abstraction Layer

## Purpose

Unified LLM provider interface supporting chat completion, embedding, structured output (JSON schema),
retry with exponential backoff, and runtime model swapping via environment variables.
Implements the LLM Abstraction Layer described in Section 4.4 of the System Architecture specification.

## Key Files

- `types.ts` -- Core interfaces: ChatMessage, LLMOptions, LLMResponse, LLMProvider, JsonSchemaDefinition
- `provider-factory.ts` -- Routes model names to the correct provider (claude-* -> Anthropic, gpt-*/text-embedding-* -> OpenAI)
- `retry.ts` -- Generic retry-with-exponential-backoff utility (3 attempts, 1s/2s/4s default)
- `providers/openai.ts` -- OpenAI provider: chat + embed, GPT-5 reasoning_effort handling, json_schema structured output
- `providers/anthropic.ts` -- Anthropic provider: chat (tool_use for structured output), embed throws (not supported)
- `provider.ts` -- Barrel re-exports for external consumers
- `token-tracker.ts` -- Token counting service: records usage, checks quotas, gets current period usage
- `tracked-provider.ts` -- LLMProvider decorator that wraps chat() calls with automatic token recording

## Interfaces

- `LLMProvider` -- exported from `types.ts`, used by pipeline and domain code via dependency injection
- `ChatMessage` -- `{ role: "system"|"user"|"assistant", content: string }`
- `LLMOptions` -- model, temperature, reasoningEffort, maxTokens, jsonSchema, signal
- `LLMResponse` -- content, usage (inputTokens/outputTokens), model, parsed (optional)
- `getProviderForModel(model, env)` -- factory function, exported from `provider-factory.ts`
- `withRetry(operation, options?)` -- retry utility, exported from `retry.ts`
- `TokenTracker` -- `{ recordUsage, checkQuota, getUsage }`, exported from `token-tracker.ts`
- `TokenQuotaResult` -- `{ exceeded, tokensUsed, quotaLimit, periodStart }`, exported from `token-tracker.ts`
- `TokenUsageRecord` -- `{ id, userId, periodStart, tokensUsed, quotaLimit, updatedAt }`, exported from `token-tracker.ts`
- `createTokenTracker(config)` -- factory, exported from `token-tracker.ts`
- `createTrackedLlmProvider(provider, tracker, userId)` -- decorator factory, exported from `tracked-provider.ts`

## Patterns & Decisions

- **GPT-5 constraint:** `gpt-5*` models reject `temperature` param entirely; use `reasoningEffort` instead (source: docs/decisions/003)
- **Anthropic structured output:** Uses tool_use pattern (tool definition + tool_choice) since Anthropic lacks native json_schema
- **Anthropic embed:** Throws immediately with `isRetryable: false` -- Anthropic has no embedding API
- **Error classification:** 429/5xx are retryable; 400/401/403/404 are non-retryable; network errors are retryable
- **Provider factory is stateless:** Creates a new provider instance each call (lightweight, SDK client is the only state)
- **DI pattern:** Factory takes `env: AppEnv` explicitly -- callers pass env, making it testable
- **Default max_tokens for Anthropic:** 4096 (Anthropic requires this param; OpenAI does not)
- **Token tracking is best-effort:** If recording fails, chat() still returns the response; a warning is logged
- **Embedding tokens not tracked:** embed() passes through unchanged -- only chat tokens are recorded
- **One record per user per month:** Upsert on unique (user_id, period_start) index; atomic increment via SQL
- **quotaLimit === 0 means unlimited:** checkQuota returns exceeded: false regardless of tokensUsed

## Dependencies

- imports from: `@/shared/errors` (LlmApiError), `@/shared/logger` (child logger for retry, token-tracker, tracked-provider), `@/shared/env` (AppEnv type)
- imports from: `@/infra/db/client` (DbClient type), `@/infra/db/queries/token-usage` (upsertTokenUsage, getTokenUsage)
- imports from: `openai` (third-party), `@anthropic-ai/sdk` (third-party)
- imported by: pipeline, gateway (via dependency injection)

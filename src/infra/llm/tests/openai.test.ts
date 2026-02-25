import { LlmApiError } from "@/shared/errors";
import { beforeEach, describe, expect, it, vi } from "vitest";

// Mock the openai module
const mockCreate = vi.fn();
const mockEmbeddingsCreate = vi.fn();

vi.mock("openai", () => {
	return {
		default: vi.fn().mockImplementation(() => ({
			chat: {
				completions: {
					create: mockCreate,
				},
			},
			embeddings: {
				create: mockEmbeddingsCreate,
			},
		})),
	};
});

import { createOpenAiProvider } from "../providers/openai";
import type { ChatMessage, LLMOptions } from "../types";

describe("createOpenAiProvider", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	describe("chat", () => {
		it("sends messages and returns response", async () => {
			mockCreate.mockResolvedValue({
				choices: [{ message: { content: "Hello back!" } }],
				usage: { prompt_tokens: 10, completion_tokens: 5 },
				model: "gpt-5-mini",
			});

			const provider = createOpenAiProvider("test-api-key");
			const messages: ChatMessage[] = [
				{ role: "system", content: "You are helpful" },
				{ role: "user", content: "Hello" },
			];
			const options: LLMOptions = { model: "gpt-5-mini" };

			const result = await provider.chat(messages, options);

			expect(result.content).toBe("Hello back!");
			expect(result.usage.inputTokens).toBe(10);
			expect(result.usage.outputTokens).toBe(5);
			expect(result.model).toBe("gpt-5-mini");
			expect(mockCreate).toHaveBeenCalledWith(
				expect.objectContaining({
					model: "gpt-5-mini",
					messages: [
						{ role: "system", content: "You are helpful" },
						{ role: "user", content: "Hello" },
					],
				}),
				undefined,
			);
		});

		it("passes temperature for non-GPT-5 models", async () => {
			mockCreate.mockResolvedValue({
				choices: [{ message: { content: "test" } }],
				usage: { prompt_tokens: 5, completion_tokens: 3 },
				model: "gpt-4o",
			});

			const provider = createOpenAiProvider("test-api-key");
			await provider.chat([{ role: "user", content: "test" }], {
				model: "gpt-4o",
				temperature: 0.5,
			});

			expect(mockCreate).toHaveBeenCalledWith(
				expect.objectContaining({
					temperature: 0.5,
				}),
				undefined,
			);
		});

		it("ignores temperature for GPT-5 models and uses reasoning_effort", async () => {
			mockCreate.mockResolvedValue({
				choices: [{ message: { content: "test" } }],
				usage: { prompt_tokens: 5, completion_tokens: 3 },
				model: "gpt-5-mini",
			});

			const provider = createOpenAiProvider("test-api-key");
			await provider.chat([{ role: "user", content: "test" }], {
				model: "gpt-5-mini",
				temperature: 0.7,
				reasoningEffort: "low",
			});

			const callArgs = mockCreate.mock.calls[0][0];
			expect(callArgs).not.toHaveProperty("temperature");
			expect(callArgs.reasoning_effort).toBe("low");
		});

		it("omits both temperature and reasoning_effort for GPT-5 when neither specified", async () => {
			mockCreate.mockResolvedValue({
				choices: [{ message: { content: "test" } }],
				usage: { prompt_tokens: 5, completion_tokens: 3 },
				model: "gpt-5-mini",
			});

			const provider = createOpenAiProvider("test-api-key");
			await provider.chat([{ role: "user", content: "test" }], { model: "gpt-5-mini" });

			const callArgs = mockCreate.mock.calls[0][0];
			expect(callArgs).not.toHaveProperty("temperature");
			expect(callArgs).not.toHaveProperty("reasoning_effort");
		});

		it("sends structured output with json_schema response_format", async () => {
			const parsed = { facts: ["likes coffee"] };
			mockCreate.mockResolvedValue({
				choices: [{ message: { content: JSON.stringify(parsed) } }],
				usage: { prompt_tokens: 20, completion_tokens: 15 },
				model: "gpt-5-mini",
			});

			const provider = createOpenAiProvider("test-api-key");
			const result = await provider.chat([{ role: "user", content: "Extract facts" }], {
				model: "gpt-5-mini",
				jsonSchema: {
					name: "extraction",
					description: "Extract facts",
					schema: {
						type: "object",
						properties: { facts: { type: "array", items: { type: "string" } } },
						required: ["facts"],
						additionalProperties: false,
					},
				},
			});

			expect(result.parsed).toEqual(parsed);
			expect(result.content).toBe(JSON.stringify(parsed));
			expect(mockCreate).toHaveBeenCalledWith(
				expect.objectContaining({
					response_format: {
						type: "json_schema",
						json_schema: {
							name: "extraction",
							description: "Extract facts",
							strict: true,
							schema: {
								type: "object",
								properties: { facts: { type: "array", items: { type: "string" } } },
								required: ["facts"],
								additionalProperties: false,
							},
						},
					},
				}),
				undefined,
			);
		});

		it("passes maxTokens option", async () => {
			mockCreate.mockResolvedValue({
				choices: [{ message: { content: "test" } }],
				usage: { prompt_tokens: 5, completion_tokens: 3 },
				model: "gpt-4o",
			});

			const provider = createOpenAiProvider("test-api-key");
			await provider.chat([{ role: "user", content: "test" }], { model: "gpt-4o", maxTokens: 500 });

			expect(mockCreate).toHaveBeenCalledWith(
				expect.objectContaining({
					max_tokens: 500,
				}),
				undefined,
			);
		});

		it("wraps 429 rate limit as retryable LlmApiError", async () => {
			const sdkError = new Error("Rate limit exceeded");
			Object.assign(sdkError, { status: 429 });
			mockCreate.mockRejectedValue(sdkError);

			const provider = createOpenAiProvider("test-api-key");

			try {
				await provider.chat([{ role: "user", content: "test" }], { model: "gpt-5-mini" });
				expect.fail("Should have thrown");
			} catch (error) {
				expect(error).toBeInstanceOf(LlmApiError);
				const llmError = error as LlmApiError;
				expect(llmError.provider).toBe("openai");
				expect(llmError.statusCode).toBe(429);
				expect(llmError.isRetryable).toBe(true);
			}
		});

		it("wraps 500 server error as retryable LlmApiError", async () => {
			const sdkError = new Error("Internal server error");
			Object.assign(sdkError, { status: 500 });
			mockCreate.mockRejectedValue(sdkError);

			const provider = createOpenAiProvider("test-api-key");

			try {
				await provider.chat([{ role: "user", content: "test" }], { model: "gpt-5-mini" });
				expect.fail("Should have thrown");
			} catch (error) {
				expect(error).toBeInstanceOf(LlmApiError);
				const llmError = error as LlmApiError;
				expect(llmError.isRetryable).toBe(true);
				expect(llmError.statusCode).toBe(500);
			}
		});

		it("wraps 400 bad request as non-retryable LlmApiError", async () => {
			const sdkError = new Error("Bad request");
			Object.assign(sdkError, { status: 400 });
			mockCreate.mockRejectedValue(sdkError);

			const provider = createOpenAiProvider("test-api-key");

			try {
				await provider.chat([{ role: "user", content: "test" }], { model: "gpt-5-mini" });
				expect.fail("Should have thrown");
			} catch (error) {
				expect(error).toBeInstanceOf(LlmApiError);
				const llmError = error as LlmApiError;
				expect(llmError.isRetryable).toBe(false);
				expect(llmError.statusCode).toBe(400);
			}
		});

		it("wraps 401 auth error as non-retryable LlmApiError", async () => {
			const sdkError = new Error("Unauthorized");
			Object.assign(sdkError, { status: 401 });
			mockCreate.mockRejectedValue(sdkError);

			const provider = createOpenAiProvider("test-api-key");

			try {
				await provider.chat([{ role: "user", content: "test" }], { model: "gpt-5-mini" });
				expect.fail("Should have thrown");
			} catch (error) {
				expect(error).toBeInstanceOf(LlmApiError);
				const llmError = error as LlmApiError;
				expect(llmError.isRetryable).toBe(false);
				expect(llmError.statusCode).toBe(401);
			}
		});

		it("wraps network errors as retryable LlmApiError", async () => {
			mockCreate.mockRejectedValue(new TypeError("fetch failed"));

			const provider = createOpenAiProvider("test-api-key");

			try {
				await provider.chat([{ role: "user", content: "test" }], { model: "gpt-5-mini" });
				expect.fail("Should have thrown");
			} catch (error) {
				expect(error).toBeInstanceOf(LlmApiError);
				const llmError = error as LlmApiError;
				expect(llmError.isRetryable).toBe(true);
				expect(llmError.statusCode).toBeUndefined();
			}
		});

		it("passes signal to SDK create call when provided", async () => {
			mockCreate.mockResolvedValue({
				choices: [{ message: { content: "test" } }],
				usage: { prompt_tokens: 5, completion_tokens: 3 },
				model: "gpt-5-mini",
			});

			const controller = new AbortController();
			const provider = createOpenAiProvider("test-api-key");
			await provider.chat([{ role: "user", content: "test" }], {
				model: "gpt-5-mini",
				signal: controller.signal,
			});

			expect(mockCreate).toHaveBeenCalledWith(expect.any(Object), { signal: controller.signal });
		});

		it("does not pass signal options when signal is undefined", async () => {
			mockCreate.mockResolvedValue({
				choices: [{ message: { content: "test" } }],
				usage: { prompt_tokens: 5, completion_tokens: 3 },
				model: "gpt-5-mini",
			});

			const provider = createOpenAiProvider("test-api-key");
			await provider.chat([{ role: "user", content: "test" }], {
				model: "gpt-5-mini",
			});

			expect(mockCreate).toHaveBeenCalledWith(expect.any(Object), undefined);
		});

		it("throws non-retryable LlmApiError when structured output JSON is invalid", async () => {
			mockCreate.mockResolvedValue({
				choices: [{ message: { content: "not valid json {{{" } }],
				usage: { prompt_tokens: 10, completion_tokens: 5 },
				model: "gpt-5-mini",
			});

			const provider = createOpenAiProvider("test-api-key");

			try {
				await provider.chat([{ role: "user", content: "Extract" }], {
					model: "gpt-5-mini",
					jsonSchema: {
						name: "extraction",
						description: "Extract facts",
						schema: {
							type: "object",
							properties: { facts: { type: "array" } },
							required: ["facts"],
							additionalProperties: false,
						},
					},
				});
				expect.fail("Should have thrown");
			} catch (error) {
				expect(error).toBeInstanceOf(LlmApiError);
				const llmError = error as LlmApiError;
				expect(llmError.message).toBe("Failed to parse structured output JSON");
				expect(llmError.provider).toBe("openai");
				expect(llmError.isRetryable).toBe(false);
			}
		});

		it("throws non-retryable LlmApiError when structured output content is empty", async () => {
			mockCreate.mockResolvedValue({
				choices: [{ message: { content: null } }],
				usage: { prompt_tokens: 10, completion_tokens: 0 },
				model: "gpt-5-mini",
			});

			const provider = createOpenAiProvider("test-api-key");

			try {
				await provider.chat([{ role: "user", content: "Extract" }], {
					model: "gpt-5-mini",
					jsonSchema: {
						name: "extraction",
						schema: { type: "object" },
					},
				});
				expect.fail("Should have thrown");
			} catch (error) {
				expect(error).toBeInstanceOf(LlmApiError);
				const llmError = error as LlmApiError;
				expect(llmError.message).toBe("Missing structured output JSON from model");
				expect(llmError.isRetryable).toBe(false);
			}
		});

		it("handles empty content response", async () => {
			mockCreate.mockResolvedValue({
				choices: [{ message: { content: null } }],
				usage: { prompt_tokens: 5, completion_tokens: 0 },
				model: "gpt-5-mini",
			});

			const provider = createOpenAiProvider("test-api-key");
			const result = await provider.chat([{ role: "user", content: "test" }], {
				model: "gpt-5-mini",
			});

			expect(result.content).toBe("");
		});
	});

	describe("embed", () => {
		it("returns embedding vector", async () => {
			const embedding = [0.1, 0.2, 0.3, 0.4, 0.5];
			mockEmbeddingsCreate.mockResolvedValue({
				data: [{ embedding }],
			});

			const provider = createOpenAiProvider("test-api-key");
			const result = await provider.embed("test text", "text-embedding-3-small");

			expect(result).toEqual(embedding);
			expect(mockEmbeddingsCreate).toHaveBeenCalledWith({
				model: "text-embedding-3-small",
				input: "test text",
			});
		});

		it("wraps embed errors as LlmApiError", async () => {
			const sdkError = new Error("Embedding failed");
			Object.assign(sdkError, { status: 500 });
			mockEmbeddingsCreate.mockRejectedValue(sdkError);

			const provider = createOpenAiProvider("test-api-key");

			try {
				await provider.embed("test", "text-embedding-3-small");
				expect.fail("Should have thrown");
			} catch (error) {
				expect(error).toBeInstanceOf(LlmApiError);
				const llmError = error as LlmApiError;
				expect(llmError.provider).toBe("openai");
				expect(llmError.isRetryable).toBe(true);
			}
		});
	});
});

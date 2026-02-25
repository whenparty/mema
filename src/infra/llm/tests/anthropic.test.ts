import { LlmApiError } from "@/shared/errors";
import { beforeEach, describe, expect, it, vi } from "vitest";

// Mock the Anthropic SDK
const mockMessagesCreate = vi.fn();

vi.mock("@anthropic-ai/sdk", () => {
	return {
		default: vi.fn().mockImplementation(() => ({
			messages: {
				create: mockMessagesCreate,
			},
		})),
	};
});

import { createAnthropicProvider } from "../providers/anthropic";
import type { ChatMessage } from "../types";

describe("createAnthropicProvider", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	describe("chat", () => {
		it("sends messages and returns response", async () => {
			mockMessagesCreate.mockResolvedValue({
				content: [{ type: "text", text: "Hello back!" }],
				usage: { input_tokens: 10, output_tokens: 5 },
				model: "claude-haiku-4-5-20250315",
			});

			const provider = createAnthropicProvider("test-api-key");
			const messages: ChatMessage[] = [{ role: "user", content: "Hello" }];

			const result = await provider.chat(messages, {
				model: "claude-haiku-4-5-20250315",
			});

			expect(result.content).toBe("Hello back!");
			expect(result.usage.inputTokens).toBe(10);
			expect(result.usage.outputTokens).toBe(5);
			expect(result.model).toBe("claude-haiku-4-5-20250315");
		});

		it("extracts system message from messages array", async () => {
			mockMessagesCreate.mockResolvedValue({
				content: [{ type: "text", text: "response" }],
				usage: { input_tokens: 10, output_tokens: 5 },
				model: "claude-haiku-4-5-20250315",
			});

			const provider = createAnthropicProvider("test-api-key");
			const messages: ChatMessage[] = [
				{ role: "system", content: "You are helpful" },
				{ role: "user", content: "Hello" },
			];

			await provider.chat(messages, {
				model: "claude-haiku-4-5-20250315",
			});

			expect(mockMessagesCreate).toHaveBeenCalledWith(
				expect.objectContaining({
					system: "You are helpful",
					messages: [{ role: "user", content: "Hello" }],
				}),
				undefined,
			);
		});

		it("omits system parameter when no system message", async () => {
			mockMessagesCreate.mockResolvedValue({
				content: [{ type: "text", text: "response" }],
				usage: { input_tokens: 5, output_tokens: 3 },
				model: "claude-haiku-4-5-20250315",
			});

			const provider = createAnthropicProvider("test-api-key");
			await provider.chat([{ role: "user", content: "Hello" }], {
				model: "claude-haiku-4-5-20250315",
			});

			const callArgs = mockMessagesCreate.mock.calls[0][0];
			expect(callArgs).not.toHaveProperty("system");
		});

		it("passes temperature option", async () => {
			mockMessagesCreate.mockResolvedValue({
				content: [{ type: "text", text: "response" }],
				usage: { input_tokens: 5, output_tokens: 3 },
				model: "claude-haiku-4-5-20250315",
			});

			const provider = createAnthropicProvider("test-api-key");
			await provider.chat([{ role: "user", content: "Hello" }], {
				model: "claude-haiku-4-5-20250315",
				temperature: 0.7,
			});

			expect(mockMessagesCreate).toHaveBeenCalledWith(
				expect.objectContaining({
					temperature: 0.7,
				}),
				undefined,
			);
		});

		it("passes maxTokens option", async () => {
			mockMessagesCreate.mockResolvedValue({
				content: [{ type: "text", text: "response" }],
				usage: { input_tokens: 5, output_tokens: 3 },
				model: "claude-haiku-4-5-20250315",
			});

			const provider = createAnthropicProvider("test-api-key");
			await provider.chat([{ role: "user", content: "Hello" }], {
				model: "claude-haiku-4-5-20250315",
				maxTokens: 500,
			});

			expect(mockMessagesCreate).toHaveBeenCalledWith(
				expect.objectContaining({
					max_tokens: 500,
				}),
				undefined,
			);
		});

		it("uses tool_use pattern for structured output", async () => {
			const toolInput = { facts: ["likes coffee"] };
			mockMessagesCreate.mockResolvedValue({
				content: [{ type: "tool_use", id: "tool_123", name: "extraction", input: toolInput }],
				usage: { input_tokens: 20, output_tokens: 15 },
				model: "claude-haiku-4-5-20250315",
			});

			const provider = createAnthropicProvider("test-api-key");
			const result = await provider.chat([{ role: "user", content: "Extract facts" }], {
				model: "claude-haiku-4-5-20250315",
				jsonSchema: {
					name: "extraction",
					description: "Extract facts from text",
					schema: {
						type: "object",
						properties: { facts: { type: "array", items: { type: "string" } } },
						required: ["facts"],
					},
				},
			});

			expect(result.parsed).toEqual(toolInput);
			expect(result.content).toBe(JSON.stringify(toolInput));

			expect(mockMessagesCreate).toHaveBeenCalledWith(
				expect.objectContaining({
					tools: [
						{
							name: "extraction",
							description: "Extract facts from text",
							input_schema: {
								type: "object",
								properties: { facts: { type: "array", items: { type: "string" } } },
								required: ["facts"],
							},
						},
					],
					tool_choice: { type: "tool", name: "extraction" },
				}),
				undefined,
			);
		});

		it("passes signal to SDK create call when provided", async () => {
			mockMessagesCreate.mockResolvedValue({
				content: [{ type: "text", text: "response" }],
				usage: { input_tokens: 5, output_tokens: 3 },
				model: "claude-haiku-4-5-20250315",
			});

			const controller = new AbortController();
			const provider = createAnthropicProvider("test-api-key");
			await provider.chat([{ role: "user", content: "Hello" }], {
				model: "claude-haiku-4-5-20250315",
				signal: controller.signal,
			});

			expect(mockMessagesCreate).toHaveBeenCalledWith(expect.any(Object), {
				signal: controller.signal,
			});
		});

		it("does not pass signal options when signal is undefined", async () => {
			mockMessagesCreate.mockResolvedValue({
				content: [{ type: "text", text: "response" }],
				usage: { input_tokens: 5, output_tokens: 3 },
				model: "claude-haiku-4-5-20250315",
			});

			const provider = createAnthropicProvider("test-api-key");
			await provider.chat([{ role: "user", content: "Hello" }], {
				model: "claude-haiku-4-5-20250315",
			});

			expect(mockMessagesCreate).toHaveBeenCalledWith(expect.any(Object), undefined);
		});

		it("collects all system messages into one system param", async () => {
			mockMessagesCreate.mockResolvedValue({
				content: [{ type: "text", text: "response" }],
				usage: { input_tokens: 10, output_tokens: 5 },
				model: "claude-haiku-4-5-20250315",
			});

			const provider = createAnthropicProvider("test-api-key");
			const messages: ChatMessage[] = [
				{ role: "system", content: "You are helpful" },
				{ role: "user", content: "Hello" },
				{ role: "system", content: "Be concise" },
			];

			await provider.chat(messages, { model: "claude-haiku-4-5-20250315" });

			expect(mockMessagesCreate).toHaveBeenCalledWith(
				expect.objectContaining({
					system: "You are helpful\n\nBe concise",
					messages: [{ role: "user", content: "Hello" }],
				}),
				undefined,
			);
		});

		it("throws non-retryable LlmApiError when tool_use block is missing in structured output", async () => {
			mockMessagesCreate.mockResolvedValue({
				content: [{ type: "text", text: "I cannot extract facts" }],
				usage: { input_tokens: 20, output_tokens: 15 },
				model: "claude-haiku-4-5-20250315",
			});

			const provider = createAnthropicProvider("test-api-key");

			try {
				await provider.chat([{ role: "user", content: "Extract facts" }], {
					model: "claude-haiku-4-5-20250315",
					jsonSchema: {
						name: "extraction",
						schema: { type: "object" },
					},
				});
				expect.fail("Should have thrown");
			} catch (error) {
				expect(error).toBeInstanceOf(LlmApiError);
				const llmError = error as LlmApiError;
				expect(llmError.message).toBe("Missing tool_use block in structured output response");
				expect(llmError.provider).toBe("anthropic");
				expect(llmError.isRetryable).toBe(false);
			}
		});

		it("wraps 429 rate limit as retryable LlmApiError", async () => {
			const sdkError = new Error("Rate limit exceeded");
			Object.assign(sdkError, { status: 429 });
			mockMessagesCreate.mockRejectedValue(sdkError);

			const provider = createAnthropicProvider("test-api-key");

			try {
				await provider.chat([{ role: "user", content: "test" }], {
					model: "claude-haiku-4-5-20250315",
				});
				expect.fail("Should have thrown");
			} catch (error) {
				expect(error).toBeInstanceOf(LlmApiError);
				const llmError = error as LlmApiError;
				expect(llmError.provider).toBe("anthropic");
				expect(llmError.statusCode).toBe(429);
				expect(llmError.isRetryable).toBe(true);
			}
		});

		it("wraps 500 server error as retryable LlmApiError", async () => {
			const sdkError = new Error("Server error");
			Object.assign(sdkError, { status: 500 });
			mockMessagesCreate.mockRejectedValue(sdkError);

			const provider = createAnthropicProvider("test-api-key");

			try {
				await provider.chat([{ role: "user", content: "test" }], {
					model: "claude-haiku-4-5-20250315",
				});
				expect.fail("Should have thrown");
			} catch (error) {
				expect(error).toBeInstanceOf(LlmApiError);
				const llmError = error as LlmApiError;
				expect(llmError.isRetryable).toBe(true);
			}
		});

		it("wraps 400 bad request as non-retryable LlmApiError", async () => {
			const sdkError = new Error("Bad request");
			Object.assign(sdkError, { status: 400 });
			mockMessagesCreate.mockRejectedValue(sdkError);

			const provider = createAnthropicProvider("test-api-key");

			try {
				await provider.chat([{ role: "user", content: "test" }], {
					model: "claude-haiku-4-5-20250315",
				});
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
			mockMessagesCreate.mockRejectedValue(sdkError);

			const provider = createAnthropicProvider("test-api-key");

			try {
				await provider.chat([{ role: "user", content: "test" }], {
					model: "claude-haiku-4-5-20250315",
				});
				expect.fail("Should have thrown");
			} catch (error) {
				expect(error).toBeInstanceOf(LlmApiError);
				const llmError = error as LlmApiError;
				expect(llmError.isRetryable).toBe(false);
			}
		});

		it("wraps network errors as retryable LlmApiError", async () => {
			mockMessagesCreate.mockRejectedValue(new TypeError("fetch failed"));

			const provider = createAnthropicProvider("test-api-key");

			try {
				await provider.chat([{ role: "user", content: "test" }], {
					model: "claude-haiku-4-5-20250315",
				});
				expect.fail("Should have thrown");
			} catch (error) {
				expect(error).toBeInstanceOf(LlmApiError);
				const llmError = error as LlmApiError;
				expect(llmError.isRetryable).toBe(true);
				expect(llmError.statusCode).toBeUndefined();
			}
		});

		it("handles empty content response", async () => {
			mockMessagesCreate.mockResolvedValue({
				content: [],
				usage: { input_tokens: 5, output_tokens: 0 },
				model: "claude-haiku-4-5-20250315",
			});

			const provider = createAnthropicProvider("test-api-key");
			const result = await provider.chat([{ role: "user", content: "test" }], {
				model: "claude-haiku-4-5-20250315",
			});

			expect(result.content).toBe("");
		});
	});

	describe("embed", () => {
		it("throws non-retryable LlmApiError with clear message", async () => {
			const provider = createAnthropicProvider("test-api-key");

			try {
				await provider.embed("test text", "text-embedding-3-small");
				expect.fail("Should have thrown");
			} catch (error) {
				expect(error).toBeInstanceOf(LlmApiError);
				const llmError = error as LlmApiError;
				expect(llmError.provider).toBe("anthropic");
				expect(llmError.isRetryable).toBe(false);
				expect(llmError.message).toContain("Anthropic does not provide an embedding API");
			}
		});
	});
});

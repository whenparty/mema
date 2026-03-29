import type { MessageInput } from "@/shared/types";
import type pino from "pino";
import { describe, expect, it, vi } from "vitest";
import type { PipelineContext, ResponseContext } from "../../types";
import {
	GENERATION_FALLBACK,
	type GenerationDeps,
	createGenerateResponseStep,
} from "../generate-response";

const TEST_INPUT: MessageInput = {
	text: "Where can I get good sushi tonight?",
	externalUserId: "user-123",
	username: "testuser",
	firstName: "Test",
	languageCode: "en",
	platformUpdateId: 42,
};

function createTestContext(overrides?: Partial<PipelineContext>): PipelineContext {
	return {
		input: TEST_INPUT,
		stepTimings: {},
		...overrides,
	};
}

function createMockLog() {
	return {
		debug: vi.fn(),
		info: vi.fn(),
		warn: vi.fn(),
		error: vi.fn(),
	} as unknown as pino.Logger;
}

function createMockGenerateChat(content = "Here are some great sushi places near you!") {
	return vi.fn().mockResolvedValue({
		content,
		model: "claude-4-haiku",
		usage: { inputTokens: 500, outputTokens: 100 },
	});
}

function createMockRenderPrompt(content = "system prompt content") {
	return vi.fn().mockResolvedValue(content);
}

function createDeps(overrides?: Partial<GenerationDeps>): GenerationDeps {
	return {
		generateChat: createMockGenerateChat(),
		renderPrompt: createMockRenderPrompt(),
		...overrides,
	};
}

function createTestResponseContext(overrides?: Partial<ResponseContext>): ResponseContext {
	return {
		userSummary: "Active user who likes cooking",
		relevantFacts: [
			{
				id: "fact-1",
				content: "Lives in Berlin",
				factType: "location",
				temporalSensitivity: "permanent",
				eventDate: null,
				sourceQuote: null,
				createdAt: new Date("2025-01-15"),
			},
			{
				id: "fact-2",
				content: "Loves spicy food",
				factType: "preference",
				temporalSensitivity: "permanent",
				eventDate: null,
				sourceQuote: "I really love spicy food",
				createdAt: new Date("2025-02-01"),
			},
		],
		conversationHistory: [
			{ role: "user", content: "Hi there!" },
			{ role: "assistant", content: "Hey! How can I help you today?" },
		],
		...overrides,
	};
}

describe("createGenerateResponseStep", () => {
	describe("happy path — chat with memory context", () => {
		it("sets ctx.response from LLM content", async () => {
			const responseText = "Great sushi in Berlin!";
			const deps = createDeps({ generateChat: createMockGenerateChat(responseText) });
			const step = createGenerateResponseStep(deps);
			const ctx = createTestContext({
				routeResult: "chat",
				responseContext: createTestResponseContext(),
			});

			await step(ctx, createMockLog());

			expect(ctx.response).toBe(responseText);
		});

		it("populates generationMetadata with model and token info", async () => {
			const deps = createDeps();
			const step = createGenerateResponseStep(deps);
			const ctx = createTestContext({
				routeResult: "chat",
				responseContext: createTestResponseContext(),
			});

			await step(ctx, createMockLog());

			expect(ctx.generationMetadata).toEqual({
				model: "claude-4-haiku",
				promptFactIds: ["fact-1", "fact-2"],
				promptFactCount: 2,
				inputTokens: 500,
				outputTokens: 100,
			});
		});

		it("calls renderPrompt with response-generation template and variables (no conversation_history)", async () => {
			const renderPrompt = createMockRenderPrompt();
			const deps = createDeps({ renderPrompt });
			const step = createGenerateResponseStep(deps);
			const ctx = createTestContext({
				routeResult: "chat",
				responseContext: createTestResponseContext(),
			});

			await step(ctx, createMockLog());

			expect(renderPrompt).toHaveBeenCalledWith("response-generation", {
				today_date: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/),
				user_first_name: "Test",
				user_summary: "Active user who likes cooking",
				memory_facts: expect.stringContaining("Lives in Berlin"),
			});
		});

		it("sends system + conversation history + user messages to generateChat", async () => {
			const systemPromptContent = "You are Mema...";
			const renderPrompt = createMockRenderPrompt(systemPromptContent);
			const generateChat = createMockGenerateChat();
			const deps = createDeps({ generateChat, renderPrompt });
			const step = createGenerateResponseStep(deps);
			const ctx = createTestContext({
				routeResult: "chat",
				responseContext: createTestResponseContext(),
			});

			await step(ctx, createMockLog());

			const messages = generateChat.mock.calls[0][0] as Array<{ role: string; content: string }>;
			expect(messages).toHaveLength(4);
			expect(messages[0]).toEqual({ role: "system", content: systemPromptContent });
			expect(messages[1]).toEqual({ role: "user", content: "Hi there!" });
			expect(messages[2]).toEqual({ role: "assistant", content: "Hey! How can I help you today?" });
			expect(messages[3]).toEqual({ role: "user", content: TEST_INPUT.text });
		});

		it("sends only system + user messages when no conversation history", async () => {
			const systemPromptContent = "You are Mema...";
			const renderPrompt = createMockRenderPrompt(systemPromptContent);
			const generateChat = createMockGenerateChat();
			const deps = createDeps({ generateChat, renderPrompt });
			const step = createGenerateResponseStep(deps);
			const ctx = createTestContext({ routeResult: "chat" });

			await step(ctx, createMockLog());

			const messages = generateChat.mock.calls[0][0] as Array<{ role: string; content: string }>;
			expect(messages).toHaveLength(2);
			expect(messages[0]).toEqual({ role: "system", content: systemPromptContent });
			expect(messages[1]).toEqual({ role: "user", content: TEST_INPUT.text });
		});
	});

	describe("happy path — chat without memory context", () => {
		it("generates response with empty context", async () => {
			const deps = createDeps();
			const step = createGenerateResponseStep(deps);
			const ctx = createTestContext({ routeResult: "chat" });

			await step(ctx, createMockLog());

			expect(ctx.response).toBe("Here are some great sushi places near you!");
		});

		it("passes empty strings and fallback text for missing context", async () => {
			const renderPrompt = createMockRenderPrompt();
			const deps = createDeps({ renderPrompt });
			const step = createGenerateResponseStep(deps);
			const ctx = createTestContext({ routeResult: "chat" });

			await step(ctx, createMockLog());

			expect(renderPrompt).toHaveBeenCalledWith("response-generation", {
				today_date: expect.any(String),
				user_first_name: "Test",
				user_summary: "",
				memory_facts: "No memory context available.",
			});
		});

		it("sets empty promptFactIds and promptFactCount 0", async () => {
			const deps = createDeps();
			const step = createGenerateResponseStep(deps);
			const ctx = createTestContext({ routeResult: "chat" });

			await step(ctx, createMockLog());

			expect(ctx.generationMetadata?.promptFactIds).toEqual([]);
			expect(ctx.generationMetadata?.promptFactCount).toBe(0);
		});
	});

	describe("guard — earlyResponse set", () => {
		it("does not call generateChat", async () => {
			const generateChat = createMockGenerateChat();
			const deps = createDeps({ generateChat });
			const step = createGenerateResponseStep(deps);
			const ctx = createTestContext({ earlyResponse: "Rate limited" });

			await step(ctx, createMockLog());

			expect(generateChat).not.toHaveBeenCalled();
			expect(ctx.generationMetadata).toBeUndefined();
		});
	});

	describe("guard — response already set", () => {
		it("preserves existing response", async () => {
			const generateChat = createMockGenerateChat();
			const deps = createDeps({ generateChat });
			const step = createGenerateResponseStep(deps);
			const ctx = createTestContext({ response: "Here are your saved facts..." });

			await step(ctx, createMockLog());

			expect(generateChat).not.toHaveBeenCalled();
			expect(ctx.response).toBe("Here are your saved facts...");
		});
	});

	describe("guard — non-chat route without response", () => {
		it("sets fallback and logs warning", async () => {
			const generateChat = createMockGenerateChat();
			const deps = createDeps({ generateChat });
			const step = createGenerateResponseStep(deps);
			const log = createMockLog();
			const ctx = createTestContext({ routeResult: "memory" });

			await step(ctx, log);

			expect(ctx.response).toBe(GENERATION_FALLBACK);
			expect(generateChat).not.toHaveBeenCalled();
			expect(log.warn).toHaveBeenCalled();
			expect(ctx.generationMetadata?.model).toBe("unknown");
		});
	});

	describe("guard — undefined routeResult proceeds with generation", () => {
		it("treats undefined routeResult as chat", async () => {
			const deps = createDeps();
			const step = createGenerateResponseStep(deps);
			const ctx = createTestContext();

			await step(ctx, createMockLog());

			expect(ctx.response).toBe("Here are some great sushi places near you!");
			expect(ctx.generationMetadata).toBeDefined();
		});
	});

	describe("error handling", () => {
		it("sets GENERATION_FALLBACK when generateChat throws", async () => {
			const generateChat = vi.fn().mockRejectedValue(new Error("API timeout"));
			const deps = createDeps({ generateChat });
			const step = createGenerateResponseStep(deps);
			const log = createMockLog();
			const ctx = createTestContext({ routeResult: "chat" });

			await step(ctx, log);

			expect(ctx.response).toBe(GENERATION_FALLBACK);
			expect(ctx.error).toBeUndefined();
			expect(log.warn).toHaveBeenCalled();
			expect(ctx.generationMetadata?.model).toBe("unknown");
		});

		it("sets GENERATION_FALLBACK when renderPrompt throws", async () => {
			const renderPrompt = vi.fn().mockRejectedValue(new Error("Template not found"));
			const deps = createDeps({ renderPrompt });
			const step = createGenerateResponseStep(deps);
			const ctx = createTestContext({ routeResult: "chat" });

			await step(ctx, createMockLog());

			expect(ctx.response).toBe(GENERATION_FALLBACK);
			expect(ctx.error).toBeUndefined();
		});

		it("handles empty LLM content as failure", async () => {
			const generateChat = createMockGenerateChat("");
			const deps = createDeps({ generateChat });
			const step = createGenerateResponseStep(deps);
			const log = createMockLog();
			const ctx = createTestContext({ routeResult: "chat" });

			await step(ctx, log);

			expect(ctx.response).toBe(GENERATION_FALLBACK);
			expect(log.warn).toHaveBeenCalled();
		});

		it("never sets ctx.error on failure", async () => {
			const generateChat = vi.fn().mockRejectedValue(new TypeError("Network error"));
			const deps = createDeps({ generateChat });
			const step = createGenerateResponseStep(deps);
			const ctx = createTestContext({ routeResult: "chat" });

			await step(ctx, createMockLog());

			expect(ctx.error).toBeUndefined();
		});
	});

	describe("security", () => {
		it("places user text only in user role message", async () => {
			const generateChat = createMockGenerateChat();
			const deps = createDeps({ generateChat });
			const step = createGenerateResponseStep(deps);
			const ctx = createTestContext({ routeResult: "chat" });

			await step(ctx, createMockLog());

			const messages = generateChat.mock.calls[0][0] as Array<{ role: string; content: string }>;
			const systemMsg = messages.find((m) => m.role === "system");
			const userMsg = messages.find((m) => m.role === "user");

			expect(systemMsg?.content).not.toContain(TEST_INPUT.text);
			expect(userMsg?.content).toBe(TEST_INPUT.text);
		});

		it("formats memory facts as string variable, not raw objects", async () => {
			const renderPrompt = createMockRenderPrompt();
			const deps = createDeps({ renderPrompt });
			const step = createGenerateResponseStep(deps);
			const ctx = createTestContext({
				routeResult: "chat",
				responseContext: createTestResponseContext(),
			});

			await step(ctx, createMockLog());

			const variables = renderPrompt.mock.calls[0][1] as Record<string, string>;
			expect(typeof variables.memory_facts).toBe("string");
			expect(variables.memory_facts).toContain("[location]");
			expect(variables.memory_facts).toContain("Lives in Berlin");
		});

		it("does not log user text or response content", async () => {
			const log = createMockLog();
			const deps = createDeps();
			const step = createGenerateResponseStep(deps);
			const ctx = createTestContext({ routeResult: "chat" });

			await step(ctx, log);

			for (const call of (log.debug as ReturnType<typeof vi.fn>).mock.calls) {
				const metadata = call[0];
				if (typeof metadata === "object" && metadata !== null) {
					const values = Object.values(metadata as Record<string, unknown>);
					for (const value of values) {
						expect(String(value)).not.toContain(TEST_INPUT.text);
					}
				}
			}
		});
	});

	describe("memory fact formatting", () => {
		it("includes temporalSensitivity when not permanent", async () => {
			const renderPrompt = createMockRenderPrompt();
			const deps = createDeps({ renderPrompt });
			const step = createGenerateResponseStep(deps);
			const ctx = createTestContext({
				routeResult: "chat",
				responseContext: createTestResponseContext({
					relevantFacts: [
						{
							id: "f1",
							content: "Works at Google",
							factType: "workplace",
							temporalSensitivity: "long_term",
							eventDate: new Date("2025-01-15"),
							sourceQuote: null,
							createdAt: new Date("2025-01-15"),
						},
					],
				}),
			});

			await step(ctx, createMockLog());

			const variables = renderPrompt.mock.calls[0][1] as Record<string, string>;
			expect(variables.memory_facts).toContain("(long_term)");
			expect(variables.memory_facts).toContain("(as of 2025-01-15)");
		});

		it("omits temporalSensitivity for permanent facts", async () => {
			const renderPrompt = createMockRenderPrompt();
			const deps = createDeps({ renderPrompt });
			const step = createGenerateResponseStep(deps);
			const ctx = createTestContext({
				routeResult: "chat",
				responseContext: createTestResponseContext({
					relevantFacts: [
						{
							id: "f1",
							content: "Birthday is March 15",
							factType: "event",
							temporalSensitivity: "permanent",
							eventDate: null,
							sourceQuote: null,
							createdAt: new Date("2025-01-01"),
						},
					],
				}),
			});

			await step(ctx, createMockLog());

			const variables = renderPrompt.mock.calls[0][1] as Record<string, string>;
			expect(variables.memory_facts).not.toContain("(permanent)");
			expect(variables.memory_facts).toContain("[event] Birthday is March 15");
		});
	});
});

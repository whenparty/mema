import { VALID_COMPLEXITIES, VALID_INTENTS } from "@/domain/classification/validate";
import type { MessageInput } from "@/shared/types";
import type pino from "pino";
import { describe, expect, it, vi } from "vitest";
import type { PipelineContext } from "../../types";
import {
	CLASSIFICATION_FALLBACK,
	CLASSIFICATION_JSON_SCHEMA,
	type ClassificationDeps,
	createClassifyIntentAndComplexityStep,
} from "../classify-intent-and-complexity";

const TEST_INPUT: MessageInput = {
	text: "Remember that my birthday is March 15",
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

const mockLog = {
	debug: vi.fn(),
	info: vi.fn(),
	warn: vi.fn(),
	error: vi.fn(),
} as unknown as pino.Logger;

function createMockClassifyMessage(parsed: unknown) {
	return vi.fn().mockResolvedValue({ parsed });
}

function createMockRenderPrompt(content = "system prompt content") {
	return vi.fn().mockResolvedValue(content);
}

function createDeps(overrides?: Partial<ClassificationDeps>): ClassificationDeps {
	return {
		classifyMessage: createMockClassifyMessage({ intent: "chat", complexity: "standard" }),
		renderPrompt: createMockRenderPrompt(),
		...overrides,
	};
}

describe("createClassifyIntentAndComplexityStep", () => {
	describe("happy path", () => {
		it("sets ctx.intent and ctx.complexity from LLM response", async () => {
			const classifyMessage = createMockClassifyMessage({
				intent: "memory.save",
				complexity: "standard",
			});
			const deps = createDeps({ classifyMessage });
			const step = createClassifyIntentAndComplexityStep(deps);
			const ctx = createTestContext();

			await step(ctx, mockLog);

			expect(ctx.intent).toBe("memory.save");
			expect(ctx.complexity).toBe("standard");
		});

		it("calls renderPrompt with correct template name and today_date", async () => {
			const renderPrompt = createMockRenderPrompt();
			const deps = createDeps({ renderPrompt });
			const step = createClassifyIntentAndComplexityStep(deps);
			const ctx = createTestContext();

			await step(ctx, mockLog);

			expect(renderPrompt).toHaveBeenCalledWith("classification", {
				today_date: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/),
			});
		});

		it("sends system and user role messages to classifyMessage", async () => {
			const systemPromptContent = "You are a classifier...";
			const renderPrompt = createMockRenderPrompt(systemPromptContent);
			const classifyMessage = createMockClassifyMessage({ intent: "chat", complexity: "trivial" });
			const deps = createDeps({ classifyMessage, renderPrompt });
			const step = createClassifyIntentAndComplexityStep(deps);
			const ctx = createTestContext();

			await step(ctx, mockLog);

			const callArgs = classifyMessage.mock.calls[0];
			const messages = callArgs[0] as Array<{ role: string; content: string }>;
			expect(messages).toHaveLength(2);
			expect(messages[0]).toEqual({ role: "system", content: systemPromptContent });
			expect(messages[1]).toEqual({ role: "user", content: TEST_INPUT.text });
		});

		it("passes JSON schema to classifyMessage options", async () => {
			const classifyMessage = createMockClassifyMessage({ intent: "chat", complexity: "standard" });
			const deps = createDeps({ classifyMessage });
			const step = createClassifyIntentAndComplexityStep(deps);
			const ctx = createTestContext();

			await step(ctx, mockLog);

			const callArgs = classifyMessage.mock.calls[0];
			const options = callArgs[1] as { jsonSchema: unknown; maxTokens: number };
			expect(options.jsonSchema).toBe(CLASSIFICATION_JSON_SCHEMA);
		});

		it("sets maxTokens to 128", async () => {
			const classifyMessage = createMockClassifyMessage({ intent: "chat", complexity: "standard" });
			const deps = createDeps({ classifyMessage });
			const step = createClassifyIntentAndComplexityStep(deps);
			const ctx = createTestContext();

			await step(ctx, mockLog);

			const callArgs = classifyMessage.mock.calls[0];
			const options = callArgs[1] as { jsonSchema: unknown; maxTokens: number };
			expect(options.maxTokens).toBe(128);
		});
	});

	describe("conservative guardrail (AC4)", () => {
		it("forces standard for memory.save with trivial", async () => {
			const classifyMessage = createMockClassifyMessage({
				intent: "memory.save",
				complexity: "trivial",
			});
			const deps = createDeps({ classifyMessage });
			const step = createClassifyIntentAndComplexityStep(deps);
			const ctx = createTestContext();

			await step(ctx, mockLog);

			expect(ctx.intent).toBe("memory.save");
			expect(ctx.complexity).toBe("standard");
		});

		it("forces standard for reminder.create with trivial", async () => {
			const classifyMessage = createMockClassifyMessage({
				intent: "reminder.create",
				complexity: "trivial",
			});
			const deps = createDeps({ classifyMessage });
			const step = createClassifyIntentAndComplexityStep(deps);
			const ctx = createTestContext();

			await step(ctx, mockLog);

			expect(ctx.intent).toBe("reminder.create");
			expect(ctx.complexity).toBe("standard");
		});

		it("forces standard for system.delete_account with trivial", async () => {
			const classifyMessage = createMockClassifyMessage({
				intent: "system.delete_account",
				complexity: "trivial",
			});
			const deps = createDeps({ classifyMessage });
			const step = createClassifyIntentAndComplexityStep(deps);
			const ctx = createTestContext();

			await step(ctx, mockLog);

			expect(ctx.intent).toBe("system.delete_account");
			expect(ctx.complexity).toBe("standard");
		});

		it("keeps trivial for chat intent", async () => {
			const classifyMessage = createMockClassifyMessage({ intent: "chat", complexity: "trivial" });
			const deps = createDeps({ classifyMessage });
			const step = createClassifyIntentAndComplexityStep(deps);
			const ctx = createTestContext();

			await step(ctx, mockLog);

			expect(ctx.intent).toBe("chat");
			expect(ctx.complexity).toBe("trivial");
		});
	});

	describe("fail-open (AC5)", () => {
		it("falls back when classifyMessage throws", async () => {
			const classifyMessage = vi.fn().mockRejectedValue(new Error("LLM connection failed"));
			const deps = createDeps({ classifyMessage });
			const step = createClassifyIntentAndComplexityStep(deps);
			const ctx = createTestContext();

			await step(ctx, mockLog);

			expect(ctx.intent).toBe("chat");
			expect(ctx.complexity).toBe("standard");
		});

		it("falls back when renderPrompt throws", async () => {
			const renderPrompt = vi.fn().mockRejectedValue(new Error("Template not found"));
			const deps = createDeps({ renderPrompt });
			const step = createClassifyIntentAndComplexityStep(deps);
			const ctx = createTestContext();

			await step(ctx, mockLog);

			expect(ctx.intent).toBe("chat");
			expect(ctx.complexity).toBe("standard");
		});

		it("falls back when parsed is null", async () => {
			const classifyMessage = createMockClassifyMessage(null);
			const deps = createDeps({ classifyMessage });
			const step = createClassifyIntentAndComplexityStep(deps);
			const ctx = createTestContext();

			await step(ctx, mockLog);

			expect(ctx.intent).toBe("chat");
			expect(ctx.complexity).toBe("standard");
		});

		it("falls back when parsed has invalid intent", async () => {
			const classifyMessage = createMockClassifyMessage({
				intent: "invalid.intent",
				complexity: "standard",
			});
			const deps = createDeps({ classifyMessage });
			const step = createClassifyIntentAndComplexityStep(deps);
			const ctx = createTestContext();

			await step(ctx, mockLog);

			expect(ctx.intent).toBe("chat");
			expect(ctx.complexity).toBe("standard");
		});

		it("falls back when parsed is a string instead of object", async () => {
			const classifyMessage = createMockClassifyMessage("chat");
			const deps = createDeps({ classifyMessage });
			const step = createClassifyIntentAndComplexityStep(deps);
			const ctx = createTestContext();

			await step(ctx, mockLog);

			expect(ctx.intent).toBe("chat");
			expect(ctx.complexity).toBe("standard");
		});

		it("never throws regardless of error type", async () => {
			const classifyMessage = vi.fn().mockRejectedValue(new TypeError("Cannot read properties"));
			const deps = createDeps({ classifyMessage });
			const step = createClassifyIntentAndComplexityStep(deps);
			const ctx = createTestContext();

			await expect(step(ctx, mockLog)).resolves.toBeUndefined();
			expect(ctx.intent).toBe("chat");
			expect(ctx.complexity).toBe("standard");
		});

		it("logs warning on fallback", async () => {
			const warnFn = vi.fn();
			const log = {
				debug: vi.fn(),
				info: vi.fn(),
				warn: warnFn,
				error: vi.fn(),
			} as unknown as pino.Logger;

			const classifyMessage = vi.fn().mockRejectedValue(new Error("LLM failed"));
			const deps = createDeps({ classifyMessage });
			const step = createClassifyIntentAndComplexityStep(deps);
			const ctx = createTestContext();

			await step(ctx, log);

			expect(warnFn).toHaveBeenCalled();
		});
	});

	describe("security (AC6)", () => {
		it("does not include user text in log metadata", async () => {
			const warnFn = vi.fn();
			const debugFn = vi.fn();
			const log = {
				debug: debugFn,
				info: vi.fn(),
				warn: warnFn,
				error: vi.fn(),
			} as unknown as pino.Logger;

			const classifyMessage = createMockClassifyMessage({ intent: "chat", complexity: "standard" });
			const deps = createDeps({ classifyMessage });
			const step = createClassifyIntentAndComplexityStep(deps);
			const ctx = createTestContext();

			await step(ctx, log);

			// Check all debug calls for user text leakage
			for (const call of debugFn.mock.calls) {
				const metadata = call[0];
				if (typeof metadata === "object" && metadata !== null) {
					const values = Object.values(metadata as Record<string, unknown>);
					for (const value of values) {
						expect(String(value)).not.toContain(TEST_INPUT.text);
					}
				}
			}
		});

		it("does not include error message in log metadata on failure", async () => {
			const warnFn = vi.fn();
			const log = {
				debug: vi.fn(),
				info: vi.fn(),
				warn: warnFn,
				error: vi.fn(),
			} as unknown as pino.Logger;

			const classifyMessage = vi.fn().mockRejectedValue(new Error("sensitive user data leaked"));
			const deps = createDeps({ classifyMessage });
			const step = createClassifyIntentAndComplexityStep(deps);
			const ctx = createTestContext();

			await step(ctx, log);

			for (const call of warnFn.mock.calls) {
				const metadata = call[0];
				if (typeof metadata === "object" && metadata !== null) {
					const obj = metadata as Record<string, unknown>;
					expect(obj).not.toHaveProperty("errorMessage");
					const values = Object.values(obj);
					for (const value of values) {
						expect(String(value)).not.toContain("sensitive user data leaked");
					}
				}
			}
		});

		it("places user text only in user role message", async () => {
			const classifyMessage = createMockClassifyMessage({ intent: "chat", complexity: "standard" });
			const deps = createDeps({ classifyMessage });
			const step = createClassifyIntentAndComplexityStep(deps);
			const ctx = createTestContext();

			await step(ctx, mockLog);

			const callArgs = classifyMessage.mock.calls[0];
			const messages = callArgs[0] as Array<{ role: string; content: string }>;
			const systemMessage = messages.find((m) => m.role === "system");
			const userMessage = messages.find((m) => m.role === "user");

			// System prompt must NOT contain user text
			expect(systemMessage?.content).not.toContain(TEST_INPUT.text);
			// User message must contain user text
			expect(userMessage?.content).toBe(TEST_INPUT.text);
		});
	});

	describe("CLASSIFICATION_JSON_SCHEMA", () => {
		it("has 14 intent enum values", () => {
			const schema = CLASSIFICATION_JSON_SCHEMA.schema as Record<string, unknown>;
			const properties = schema.properties as Record<string, Record<string, unknown>>;
			const intentEnum = properties.intent.enum as string[];
			expect(intentEnum).toHaveLength(14);
			for (const intent of VALID_INTENTS) {
				expect(intentEnum).toContain(intent);
			}
		});

		it("has 2 complexity enum values", () => {
			const schema = CLASSIFICATION_JSON_SCHEMA.schema as Record<string, unknown>;
			const properties = schema.properties as Record<string, Record<string, unknown>>;
			const complexityEnum = properties.complexity.enum as string[];
			expect(complexityEnum).toHaveLength(2);
			for (const complexity of VALID_COMPLEXITIES) {
				expect(complexityEnum).toContain(complexity);
			}
		});

		it("requires both intent and complexity fields", () => {
			const schema = CLASSIFICATION_JSON_SCHEMA.schema as Record<string, unknown>;
			const required = schema.required as string[];
			expect(required).toContain("intent");
			expect(required).toContain("complexity");
		});

		it("disallows additional properties", () => {
			const schema = CLASSIFICATION_JSON_SCHEMA.schema as Record<string, unknown>;
			expect(schema.additionalProperties).toBe(false);
		});
	});

	describe("CLASSIFICATION_FALLBACK", () => {
		it("has chat intent and standard complexity", () => {
			expect(CLASSIFICATION_FALLBACK).toEqual({
				intent: "chat",
				complexity: "standard",
			});
		});
	});
});

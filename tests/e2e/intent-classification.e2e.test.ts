import * as path from "node:path";
import { VALID_INTENTS } from "@/domain/classification/validate";
import { createPromptLoader } from "@/infra/llm/prompt-loader";
import {
	type ClassificationDeps,
	type JsonSchemaDefinition,
	createClassifyIntentAndComplexityStep,
} from "@/pipeline/steps/classify-intent-and-complexity";
import type { PipelineContext } from "@/pipeline/types";
import type { MessageInput } from "@/shared/types";
import type pino from "pino";
import { describe, expect, it, vi } from "vitest";

const PROMPTS_DIR = path.resolve(import.meta.dirname, "../../prompts");

const TEST_INPUT: MessageInput = {
	text: "Remember that my cat's name is Whiskers",
	externalUserId: "user-e2e",
	username: "e2euser",
	firstName: "E2E",
	languageCode: "en",
	platformUpdateId: 100,
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

interface StubClassifyMessageCall {
	messages: Array<{ role: string; content: string }>;
	options: { jsonSchema: JsonSchemaDefinition; maxTokens: number };
}

function createStubClassifyMessage(parsed: unknown) {
	const calls: StubClassifyMessageCall[] = [];
	const fn = vi
		.fn()
		.mockImplementation(
			(
				messages: Array<{ role: string; content: string }>,
				options: { jsonSchema: JsonSchemaDefinition; maxTokens: number },
			) => {
				calls.push({ messages, options });
				return Promise.resolve({ parsed });
			},
		);
	return { fn, calls };
}

function createRealRenderPrompt() {
	const loader = createPromptLoader({
		promptsDir: PROMPTS_DIR,
		nodeEnv: "test",
	});
	return loader.render.bind(loader);
}

describe("E2E: Intent Classification", () => {
	describe("prompt template loading", () => {
		it("loads classification.ftl and interpolates today_date", async () => {
			const renderPrompt = createRealRenderPrompt();
			const todayDate = new Date().toISOString().slice(0, 10);

			const rendered = await renderPrompt("classification", {
				today_date: todayDate,
			});

			expect(rendered).toContain("message classifier");
			expect(rendered).toContain(todayDate);
		});

		it("template contains all 14 intent names", async () => {
			const renderPrompt = createRealRenderPrompt();
			const rendered = await renderPrompt("classification", {
				today_date: "2026-03-05",
			});

			for (const intent of VALID_INTENTS) {
				expect(rendered).toContain(intent);
			}
		});
	});

	describe("full step with real template + stub LLM", () => {
		it("classifies memory.save and applies guardrail to force standard", async () => {
			const { fn: classifyMessage, calls } = createStubClassifyMessage({
				intent: "memory.save",
				complexity: "trivial",
			});
			const deps: ClassificationDeps = {
				classifyMessage,
				renderPrompt: createRealRenderPrompt(),
			};
			const step = createClassifyIntentAndComplexityStep(deps);
			const ctx = createTestContext();

			await step(ctx, mockLog);

			expect(ctx.intent).toBe("memory.save");
			expect(ctx.complexity).toBe("standard");

			// Verify real template was loaded and sent to classifyMessage
			expect(calls).toHaveLength(1);
			const messages = calls[0].messages;
			expect(messages[0].role).toBe("system");
			expect(messages[0].content).toContain("Intent Taxonomy");
		});

		it("classifies chat/trivial without guardrail change", async () => {
			const { fn: classifyMessage } = createStubClassifyMessage({
				intent: "chat",
				complexity: "trivial",
			});
			const deps: ClassificationDeps = {
				classifyMessage,
				renderPrompt: createRealRenderPrompt(),
			};
			const step = createClassifyIntentAndComplexityStep(deps);
			const ctx = createTestContext({
				input: { ...TEST_INPUT, text: "Hi!" },
			});

			await step(ctx, mockLog);

			expect(ctx.intent).toBe("chat");
			expect(ctx.complexity).toBe("trivial");
		});

		it("classifies system.delete_account and applies guardrail", async () => {
			const { fn: classifyMessage } = createStubClassifyMessage({
				intent: "system.delete_account",
				complexity: "trivial",
			});
			const deps: ClassificationDeps = {
				classifyMessage,
				renderPrompt: createRealRenderPrompt(),
			};
			const step = createClassifyIntentAndComplexityStep(deps);
			const ctx = createTestContext({
				input: { ...TEST_INPUT, text: "Delete all my data" },
			});

			await step(ctx, mockLog);

			expect(ctx.intent).toBe("system.delete_account");
			expect(ctx.complexity).toBe("standard");
		});

		it("classifies reminder.create and applies guardrail", async () => {
			const { fn: classifyMessage } = createStubClassifyMessage({
				intent: "reminder.create",
				complexity: "trivial",
			});
			const deps: ClassificationDeps = {
				classifyMessage,
				renderPrompt: createRealRenderPrompt(),
			};
			const step = createClassifyIntentAndComplexityStep(deps);
			const ctx = createTestContext({
				input: { ...TEST_INPUT, text: "Remind me tomorrow at 9" },
			});

			await step(ctx, mockLog);

			expect(ctx.intent).toBe("reminder.create");
			expect(ctx.complexity).toBe("standard");
		});

		it("falls back gracefully on garbled LLM output", async () => {
			const { fn: classifyMessage } = createStubClassifyMessage({
				garbled: true,
				nonsense: 42,
			});
			const deps: ClassificationDeps = {
				classifyMessage,
				renderPrompt: createRealRenderPrompt(),
			};
			const step = createClassifyIntentAndComplexityStep(deps);
			const ctx = createTestContext();

			await step(ctx, mockLog);

			expect(ctx.intent).toBe("chat");
			expect(ctx.complexity).toBe("standard");
		});

		it("falls back gracefully on LLM failure", async () => {
			const classifyMessage = vi.fn().mockRejectedValue(new Error("Connection timeout"));
			const deps: ClassificationDeps = {
				classifyMessage,
				renderPrompt: createRealRenderPrompt(),
			};
			const step = createClassifyIntentAndComplexityStep(deps);
			const ctx = createTestContext();

			await step(ctx, mockLog);

			expect(ctx.intent).toBe("chat");
			expect(ctx.complexity).toBe("standard");
		});
	});
});

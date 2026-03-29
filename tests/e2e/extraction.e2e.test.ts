import * as path from "node:path";
import { createPromptLoader } from "@/infra/llm/prompt-loader";
import type { JsonSchemaDefinition } from "@/pipeline/steps/classify-intent-and-complexity";
import {
	EXTRACTION_COMBINED_JSON_SCHEMA,
	type ExtractFactsDeps,
	createExtractFactsStep,
} from "@/pipeline/steps/extract-facts";
import type { PipelineContext } from "@/pipeline/types";
import type { MessageInput } from "@/shared/types";
import type pino from "pino";
import { describe, expect, it, vi } from "vitest";

const PROMPTS_DIR = path.resolve(import.meta.dirname, "../../prompts");

const TEST_INPUT: MessageInput = {
	text: "We went to the doctor yesterday",
	externalUserId: "user-e2e-extract",
	username: "e2eextract",
	firstName: "E2E",
	languageCode: "en",
	platformUpdateId: 101,
};

const FROZEN_ANCHOR = "2026-03-15";

function createTestContext(overrides?: Partial<PipelineContext>): PipelineContext {
	return {
		input: TEST_INPUT,
		stepTimings: {},
		userId: "internal-user-e2e",
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

function adrParsedMatchingUserText() {
	return {
		facts: [
			{
				content: "Doctor visit yesterday",
				fact_type: "health",
				event_date: "2026-03-14",
				temporal_sensitivity: "short_term",
				source_quote: "doctor yesterday",
				is_injection_attempt: false,
			},
		],
		entities: [{ id: "e1" }],
		conflicts: [],
		intent: "memory.save",
		complexity: "standard",
		relevant_fact_types: ["health"],
	};
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

describe("E2E: Fact extraction (TASK-5.1)", () => {
	describe("prompt template loading (NFR-PORT.1)", () => {
		it("loads extraction.ftl and interpolates message_anchor_date", async () => {
			const renderPrompt = createRealRenderPrompt();

			const rendered = await renderPrompt("extraction", {
				message_anchor_date: FROZEN_ANCHOR,
			});

			expect(rendered).toContain("fact-extraction model");
			expect(rendered).toContain(FROZEN_ANCHOR);
			expect(rendered).toContain("message_anchor_date");
		});

		it("template lists all fact_type literals from FR-MEM.1", async () => {
			const renderPrompt = createRealRenderPrompt();
			const rendered = await renderPrompt("extraction", {
				message_anchor_date: "2026-01-01",
			});

			for (const token of [
				"location",
				"workplace",
				"relationship",
				"event",
				"preference",
				"health",
				"date",
				"financial",
				"other",
			]) {
				expect(rendered).toContain(token);
			}
		});
	});

	describe("full step with real template + stub LLM", () => {
		it("writes ctx.extractedFacts using rendered system prompt and isolates user text in user role (NFR-SEC.3)", async () => {
			const { fn: classifyMessage, calls } = createStubClassifyMessage(adrParsedMatchingUserText());
			const deps: ExtractFactsDeps = {
				classifyMessage,
				renderPrompt: createRealRenderPrompt(),
				getMessageAnchorDate: () => FROZEN_ANCHOR,
			};
			const step = createExtractFactsStep(deps);
			const ctx = createTestContext();

			await step(ctx, mockLog);

			expect(ctx.extractedFacts).toHaveLength(1);
			expect(ctx.extractedFacts?.[0]).toMatchObject({
				fact_type: "health",
				source_quote: "doctor yesterday",
			});

			expect(calls).toHaveLength(1);
			const messages = calls[0].messages;
			expect(messages).toHaveLength(2);
			expect(messages[0].role).toBe("system");
			expect(messages[1].role).toBe("user");
			expect(messages[1].content).toBe(TEST_INPUT.text);
			expect(messages[0].content).toContain(FROZEN_ANCHOR);
			expect(messages[0].content).toContain("source_quote");
			expect(messages[0].content).not.toContain(TEST_INPUT.text);

			expect(calls[0].options.jsonSchema).toBe(EXTRACTION_COMBINED_JSON_SCHEMA);
			expect(calls[0].options.maxTokens).toBe(4096);
		});

		it("falls back to empty facts when domain rejects parsed output", async () => {
			const { fn: classifyMessage } = createStubClassifyMessage({
				...adrParsedMatchingUserText(),
				facts: [
					{
						...adrParsedMatchingUserText().facts[0],
						fact_type: "not_a_real_type",
					},
				],
			});
			const deps: ExtractFactsDeps = {
				classifyMessage,
				renderPrompt: createRealRenderPrompt(),
				getMessageAnchorDate: () => FROZEN_ANCHOR,
			};
			const step = createExtractFactsStep(deps);
			const ctx = createTestContext();

			await step(ctx, mockLog);

			expect(ctx.extractedFacts).toEqual([]);
		});
	});
});

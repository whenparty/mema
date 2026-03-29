import type { MessageInput } from "@/shared/types";
import type pino from "pino";
import { describe, expect, it, vi } from "vitest";
import type { PipelineContext } from "../../types";
import {
	EXTRACTION_COMBINED_JSON_SCHEMA,
	type ExtractFactsDeps,
	createExtractFactsStep,
} from "../extract-facts";

const TEST_INPUT: MessageInput = {
	text: "We went to the doctor yesterday",
	externalUserId: "user-123",
	username: "testuser",
	firstName: "Test",
	languageCode: "en",
	platformUpdateId: 42,
};

const FROZEN_ANCHOR = "2026-03-15";

function createTestContext(overrides?: Partial<PipelineContext>): PipelineContext {
	return {
		input: TEST_INPUT,
		stepTimings: {},
		userId: "internal-user-1",
		...overrides,
	};
}

const mockLog = {
	debug: vi.fn(),
	info: vi.fn(),
	warn: vi.fn(),
	error: vi.fn(),
} as unknown as pino.Logger;

function fullAdrParsedFixture() {
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
		entities: [{ id: "e1", label: "Doctor" }],
		conflicts: [{ id: "c1" }],
		intent: "memory.save",
		complexity: "standard",
		relevant_fact_types: ["health", "event"],
	};
}

function createMockClassifyMessage(parsed: unknown) {
	return vi.fn().mockResolvedValue({ parsed });
}

function createMockRenderPrompt(content = "extraction system prompt") {
	return vi.fn().mockResolvedValue(content);
}

function createDeps(overrides?: Partial<ExtractFactsDeps>): ExtractFactsDeps {
	return {
		classifyMessage: createMockClassifyMessage(fullAdrParsedFixture()),
		renderPrompt: createMockRenderPrompt(),
		getMessageAnchorDate: () => FROZEN_ANCHOR,
		...overrides,
	};
}

describe("createExtractFactsStep", () => {
	describe("happy path (AC1 / EC4 / EC5)", () => {
		it("sets ctx.extractedFacts from validated facts only when LLM returns full ADR-shaped payload", async () => {
			const classifyMessage = createMockClassifyMessage(fullAdrParsedFixture());
			const deps = createDeps({ classifyMessage });
			const step = createExtractFactsStep(deps);
			const ctx = createTestContext();

			await step(ctx, mockLog);

			expect(ctx.extractedFacts).toHaveLength(1);
			expect(ctx.extractedFacts?.[0]).toMatchObject({
				content: "Doctor visit yesterday",
				fact_type: "health",
				event_date: "2026-03-14",
				source_quote: "doctor yesterday",
				is_injection_attempt: false,
			});
		});

		it("does not set ctx.intent, ctx.complexity, ctx.resolvedEntities, or ctx.conflicts from extraction JSON", async () => {
			const sentinelEntity = { sentinel: true };
			const sentinelConflict = { sentinel: true };
			const deps = createDeps();
			const step = createExtractFactsStep(deps);
			const ctx = createTestContext({
				resolvedEntities: [sentinelEntity],
				conflicts: [sentinelConflict],
			});

			await step(ctx, mockLog);

			expect(ctx.intent).toBeUndefined();
			expect(ctx.complexity).toBeUndefined();
			expect(ctx.resolvedEntities).toEqual([sentinelEntity]);
			expect(ctx.conflicts).toEqual([sentinelConflict]);
		});

		it("does not set ctx.earlyResponse (AC5)", async () => {
			const deps = createDeps();
			const step = createExtractFactsStep(deps);
			const ctx = createTestContext();

			await step(ctx, mockLog);

			expect(ctx.earlyResponse).toBeUndefined();
		});
	});

	describe("prompt and LLM wiring (NFR-SEC.3 / C10)", () => {
		it("renders extraction template with frozen message_anchor_date (logical-anchor tier, not Telegram created_at)", async () => {
			const renderPrompt = createMockRenderPrompt();
			const getMessageAnchorDate = vi.fn().mockReturnValue(FROZEN_ANCHOR);
			const deps = createDeps({ renderPrompt, getMessageAnchorDate });
			const step = createExtractFactsStep(deps);
			const ctx = createTestContext();

			await step(ctx, mockLog);

			expect(getMessageAnchorDate).toHaveBeenCalledWith(ctx);
			expect(renderPrompt).toHaveBeenCalledWith("extraction", {
				message_anchor_date: FROZEN_ANCHOR,
			});
		});

		it("sends system then user messages; user content is ctx.input.text only", async () => {
			const systemBody = "policy only";
			const renderPrompt = createMockRenderPrompt(systemBody);
			const classifyMessage = createMockClassifyMessage(fullAdrParsedFixture());
			const deps = createDeps({ renderPrompt, classifyMessage });
			const step = createExtractFactsStep(deps);
			const ctx = createTestContext();

			await step(ctx, mockLog);

			const messages = classifyMessage.mock.calls[0][0] as Array<{ role: string; content: string }>;
			expect(messages).toHaveLength(2);
			expect(messages[0]).toEqual({ role: "system", content: systemBody });
			expect(messages[1]).toEqual({ role: "user", content: TEST_INPUT.text });
			expect(messages[0].content).not.toContain(TEST_INPUT.text);
		});

		it("passes EXTRACTION_COMBINED_JSON_SCHEMA and maxTokens 4096 to classifyMessage", async () => {
			const classifyMessage = createMockClassifyMessage(fullAdrParsedFixture());
			const deps = createDeps({ classifyMessage });
			const step = createExtractFactsStep(deps);
			const ctx = createTestContext();

			await step(ctx, mockLog);

			const options = classifyMessage.mock.calls[0][1] as {
				jsonSchema: typeof EXTRACTION_COMBINED_JSON_SCHEMA;
				maxTokens: number;
			};
			expect(options.jsonSchema).toBe(EXTRACTION_COMBINED_JSON_SCHEMA);
			expect(options.maxTokens).toBe(4096);
		});
	});

	describe("failure handling (EC1 / C11)", () => {
		it("sets ctx.extractedFacts to [] and warns when validation fails", async () => {
			const warn = vi.fn();
			const log = { ...mockLog, warn } as unknown as pino.Logger;
			const invalid = {
				...fullAdrParsedFixture(),
				facts: [{ ...fullAdrParsedFixture().facts[0], fact_type: "bad" }],
			};
			const classifyMessage = createMockClassifyMessage(invalid);
			const deps = createDeps({ classifyMessage });
			const step = createExtractFactsStep(deps);
			const ctx = createTestContext();

			await step(ctx, log);

			expect(ctx.extractedFacts).toEqual([]);
			expect(warn).toHaveBeenCalled();
			const meta = warn.mock.calls[0][0] as Record<string, unknown>;
			expect(meta).toMatchObject({
				userId: ctx.userId,
				step: "extract_facts",
				reason: "extraction_validation_failed",
			});
		});

		it("does not throw when classifyMessage rejects", async () => {
			const classifyMessage = vi.fn().mockRejectedValue(new Error("network"));
			const deps = createDeps({ classifyMessage });
			const step = createExtractFactsStep(deps);
			const ctx = createTestContext();

			await expect(step(ctx, mockLog)).resolves.toBeUndefined();
			expect(ctx.extractedFacts).toEqual([]);
		});

		it("does not throw when renderPrompt rejects", async () => {
			const renderPrompt = vi.fn().mockRejectedValue(new Error("PromptLoadError"));
			const deps = createDeps({ renderPrompt });
			const step = createExtractFactsStep(deps);
			const ctx = createTestContext();

			await expect(step(ctx, mockLog)).resolves.toBeUndefined();
			expect(ctx.extractedFacts).toEqual([]);
		});

		it("warns with Error.name only when classifyMessage throws (metadata-only)", async () => {
			const warn = vi.fn();
			const log = { ...mockLog, warn } as unknown as pino.Logger;
			const classifyMessage = vi.fn().mockRejectedValue(new TypeError("boom"));
			const deps = createDeps({ classifyMessage });
			const step = createExtractFactsStep(deps);
			const ctx = createTestContext();

			await step(ctx, log);

			const meta = warn.mock.calls[0][0] as Record<string, unknown>;
			expect(meta).toMatchObject({ userId: ctx.userId, step: "extract_facts", error: "TypeError" });
		});
	});
});

describe("EXTRACTION_COMBINED_JSON_SCHEMA", () => {
	it("describes root object with ADR-003 + ADR-005 keys and additionalProperties false", () => {
		const schema = EXTRACTION_COMBINED_JSON_SCHEMA.schema as Record<string, unknown>;
		expect(schema.type).toBe("object");
		expect(schema.additionalProperties).toBe(false);
		const properties = schema.properties as Record<string, unknown>;
		expect(properties).toHaveProperty("facts");
		expect(properties).toHaveProperty("entities");
		expect(properties).toHaveProperty("conflicts");
		expect(properties).toHaveProperty("intent");
		expect(properties).toHaveProperty("complexity");
		expect(properties).toHaveProperty("relevant_fact_types");
		const required = schema.required as string[];
		expect(required).toContain("facts");
	});
});

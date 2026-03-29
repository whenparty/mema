import {
	VALID_FACT_TYPES,
	VALID_TEMPORAL_SENSITIVITIES,
	validateCombinedExtractionOutput,
} from "@/domain/extraction/validate";
import type pino from "pino";
import type { PipelineContext, PipelineStep } from "../types";
import type { ClassificationDeps, JsonSchemaDefinition } from "./classify-intent-and-complexity";

/**
 * Incremental schema carry-forward: ADR-005 describes merged “step 8” combined output;
 * this field is emitted on the runtime `extract_facts` (step 4) structured call until
 * orchestration merges steps (ADR005-NAMING). Domain still tolerates unknown top-level
 * keys if a provider ever returns extras past `additionalProperties: false`.
 */
const FACT_OBJECT_SCHEMA: Record<string, unknown> = {
	type: "object",
	properties: {
		content: { type: "string" },
		fact_type: { type: "string", enum: [...VALID_FACT_TYPES] },
		event_date: {
			anyOf: [{ type: "null" }, { type: "string", pattern: "^\\d{4}-\\d{2}-\\d{2}$" }],
		},
		temporal_sensitivity: { type: "string", enum: [...VALID_TEMPORAL_SENSITIVITIES] },
		source_quote: { type: "string" },
		is_injection_attempt: { type: "boolean" },
	},
	required: [
		"content",
		"fact_type",
		"event_date",
		"temporal_sensitivity",
		"source_quote",
		"is_injection_attempt",
	],
	additionalProperties: false,
};

export const EXTRACTION_COMBINED_JSON_SCHEMA: JsonSchemaDefinition = {
	name: "extraction_combined",
	description:
		"ADR-003 combined extraction: facts, entities, conflicts, intent, complexity; ADR-005 relevant_fact_types (validated in domain, not stored on ctx).",
	schema: {
		type: "object",
		properties: {
			facts: {
				type: "array",
				items: FACT_OBJECT_SCHEMA,
			},
			entities: {
				type: "array",
				items: { type: "object", additionalProperties: true },
			},
			conflicts: {
				type: "array",
				items: { type: "object", additionalProperties: true },
			},
			intent: { type: "string" },
			complexity: { type: "string" },
			relevant_fact_types: {
				type: "array",
				items: { type: "string", enum: [...VALID_FACT_TYPES] },
			},
		},
		required: ["facts"],
		additionalProperties: false,
	},
};

/** maxTokens: bounded output for full object; 4096 aligns with Anthropic structured-output headroom per infra AGENTS notes. */
const EXTRACTION_MAX_TOKENS = 4096;

export interface ExtractFactsDeps {
	readonly classifyMessage: ClassificationDeps["classifyMessage"];
	readonly renderPrompt: ClassificationDeps["renderPrompt"];
	readonly getMessageAnchorDate: (ctx: PipelineContext) => string;
}

export function createExtractFactsStep(deps: ExtractFactsDeps): PipelineStep {
	return async (ctx: PipelineContext, log: pino.Logger): Promise<void> => {
		try {
			const messageAnchorDate = deps.getMessageAnchorDate(ctx);
			const systemPrompt = await deps.renderPrompt("extraction", {
				message_anchor_date: messageAnchorDate,
			});
			const messages = [
				{ role: "system" as const, content: systemPrompt },
				{ role: "user" as const, content: ctx.input.text },
			];
			const response = await deps.classifyMessage(messages, {
				jsonSchema: EXTRACTION_COMBINED_JSON_SCHEMA,
				maxTokens: EXTRACTION_MAX_TOKENS,
			});
			const validated = validateCombinedExtractionOutput(response.parsed, ctx.input.text);
			if (validated === null) {
				log.warn(
					{
						userId: ctx.userId,
						step: "extract_facts",
						reason: "extraction_validation_failed",
					},
					"extraction output failed domain validation",
				);
				ctx.extractedFacts = [];
				return;
			}
			ctx.extractedFacts = [...validated.facts];
		} catch (error: unknown) {
			log.warn(
				{
					userId: ctx.userId,
					step: "extract_facts",
					error: error instanceof Error ? error.name : "UnknownError",
				},
				"extraction step failed",
			);
			ctx.extractedFacts = [];
		}
	};
}

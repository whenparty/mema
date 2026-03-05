import {
	type ClassificationResult,
	VALID_COMPLEXITIES,
	VALID_INTENTS,
	applyComplexityGuardrail,
	validateClassification,
} from "@/domain/classification/validate";
import type pino from "pino";
import type { PipelineContext, PipelineStep } from "../types";

interface ChatMessage {
	role: "system" | "user";
	content: string;
}

export interface JsonSchemaDefinition {
	name: string;
	description?: string;
	schema: Record<string, unknown>;
}

export interface ClassificationDeps {
	classifyMessage: (
		messages: ChatMessage[],
		options: { jsonSchema: JsonSchemaDefinition; maxTokens: number },
	) => Promise<{ parsed?: unknown }>;
	renderPrompt: (templateName: string, variables: Record<string, string>) => Promise<string>;
}

export const CLASSIFICATION_FALLBACK: Readonly<ClassificationResult> = Object.freeze({
	intent: "chat",
	complexity: "standard",
});

export const CLASSIFICATION_JSON_SCHEMA: JsonSchemaDefinition = {
	name: "classification",
	description: "Classify the user message into an intent and complexity level",
	schema: {
		type: "object",
		properties: {
			intent: {
				type: "string",
				enum: [...VALID_INTENTS],
			},
			complexity: {
				type: "string",
				enum: [...VALID_COMPLEXITIES],
			},
		},
		required: ["intent", "complexity"],
		additionalProperties: false,
	},
};

export function createClassifyIntentAndComplexityStep(deps: ClassificationDeps): PipelineStep {
	return async (ctx: PipelineContext, log: pino.Logger): Promise<void> => {
		try {
			const todayDate = new Date().toISOString().slice(0, 10);
			const systemPrompt = await deps.renderPrompt("classification", {
				today_date: todayDate,
			});

			const messages: ChatMessage[] = [
				{ role: "system", content: systemPrompt },
				{ role: "user", content: ctx.input.text },
			];

			const response = await deps.classifyMessage(messages, {
				jsonSchema: CLASSIFICATION_JSON_SCHEMA,
				maxTokens: 128,
			});

			const result = validateClassification(response.parsed);
			if (result === null) {
				log.warn(
					{ userId: ctx.userId, step: "classify_intent_and_complexity" },
					"invalid classification from LLM, using fallback",
				);
				ctx.intent = CLASSIFICATION_FALLBACK.intent;
				ctx.complexity = CLASSIFICATION_FALLBACK.complexity;
				return;
			}

			const guarded = applyComplexityGuardrail(result);

			ctx.intent = guarded.intent;
			ctx.complexity = guarded.complexity;

			log.debug(
				{ userId: ctx.userId, intent: guarded.intent, complexity: guarded.complexity },
				"classification complete",
			);
		} catch (error: unknown) {
			log.warn(
				{
					userId: ctx.userId,
					step: "classify_intent_and_complexity",
					error: error instanceof Error ? error.name : "UnknownError",
				},
				"classification step failed, using fallback",
			);
			ctx.intent = CLASSIFICATION_FALLBACK.intent;
			ctx.complexity = CLASSIFICATION_FALLBACK.complexity;
		}
	};
}

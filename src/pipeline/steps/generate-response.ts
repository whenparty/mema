import type pino from "pino";
import type { MemoryFact, PipelineContext, PipelineStep } from "../types";

interface ChatMessage {
	role: "system" | "user" | "assistant";
	content: string;
}

export interface GenerationDeps {
	generateChat: (
		messages: ChatMessage[],
		options: { maxTokens?: number },
	) => Promise<{ content: string; model: string; usage: { inputTokens: number; outputTokens: number } }>;
	renderPrompt: (templateName: string, variables: Record<string, string>) => Promise<string>;
}

export const GENERATION_FALLBACK =
	"I'm sorry, I couldn't generate a response right now. Please try again.";

function formatMemoryFacts(facts: MemoryFact[]): string {
	return facts
		.map((fact) => {
			let line = `- [${fact.factType}]`;
			if (fact.temporalSensitivity !== "permanent") {
				line += ` (${fact.temporalSensitivity})`;
			}
			line += ` ${fact.content}`;
			if (fact.eventDate !== null) {
				const dateStr =
					fact.eventDate instanceof Date
						? fact.eventDate.toISOString().slice(0, 10)
						: String(fact.eventDate);
				line += ` (as of ${dateStr})`;
			}
			return line;
		})
		.join("\n");
}

export function createGenerateResponseStep(deps: GenerationDeps): PipelineStep {
	return async (ctx: PipelineContext, log: pino.Logger): Promise<void> => {
		if (ctx.earlyResponse !== undefined) {
			return;
		}

		if (ctx.response !== undefined) {
			return;
		}

		if (ctx.routeResult !== undefined && ctx.routeResult !== "chat") {
			log.warn(
				{ userId: ctx.userId, step: "generate_response", routeResult: ctx.routeResult },
				"non-chat route without response, using fallback",
			);
			ctx.response = GENERATION_FALLBACK;
			ctx.generationMetadata = {
				model: "unknown",
				promptFactIds: [],
				promptFactCount: 0,
			};
			return;
		}

		const responseContext = ctx.responseContext ?? null;
		const facts = responseContext?.relevantFacts ?? [];
		const promptFactIds = facts.map((f) => f.id);

		const variables: Record<string, string> = {
			today_date: new Date().toISOString().slice(0, 10),
			user_first_name: ctx.input.firstName,
			user_summary: responseContext?.userSummary ?? "",
			memory_facts:
				facts.length > 0
					? formatMemoryFacts(facts)
					: "No memory context available.",
		};

		try {
			const systemPrompt = await deps.renderPrompt("response-generation", variables);
			const messages: ChatMessage[] = [
				{ role: "system", content: systemPrompt },
			];

			const history = responseContext?.conversationHistory ?? [];
			for (const msg of history) {
				messages.push({ role: msg.role, content: msg.content });
			}

			messages.push({ role: "user", content: ctx.input.text });

			const result = await deps.generateChat(messages, {});

			if (!result.content) {
				log.warn(
					{ userId: ctx.userId, step: "generate_response" },
					"LLM returned empty content, using fallback",
				);
				ctx.response = GENERATION_FALLBACK;
				ctx.generationMetadata = {
					model: result.model,
					promptFactIds,
					promptFactCount: promptFactIds.length,
				};
				return;
			}

			ctx.response = result.content;
			ctx.generationMetadata = {
				model: result.model,
				promptFactIds,
				promptFactCount: promptFactIds.length,
				inputTokens: result.usage.inputTokens,
				outputTokens: result.usage.outputTokens,
			};

			log.debug(
				{
					userId: ctx.userId,
					step: "generate_response",
					model: result.model,
					promptFactCount: promptFactIds.length,
				},
				"generation complete",
			);
		} catch (error: unknown) {
			log.warn(
				{
					userId: ctx.userId,
					step: "generate_response",
					error: error instanceof Error ? error.name : "UnknownError",
				},
				"generation step failed, using fallback",
			);
			ctx.response = GENERATION_FALLBACK;
			ctx.generationMetadata = {
				model: "unknown",
				promptFactIds,
				promptFactCount: promptFactIds.length,
			};
		}
	};
}

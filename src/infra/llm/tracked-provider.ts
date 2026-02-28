import { createChildLogger } from "@/shared/logger";
import type { TokenTracker } from "./token-tracker";
import type { ChatMessage, LLMOptions, LLMProvider, LLMResponse } from "./types";

/**
 * Wraps an LLMProvider to automatically record token usage after each chat() call.
 * Token recording is best-effort: if it fails, a warning is logged but the
 * response is still returned.
 *
 * Embedding tokens are not tracked — embedding calls pass through unchanged.
 */
export function createTrackedLlmProvider(
	provider: LLMProvider,
	tracker: TokenTracker,
	userId: string,
): LLMProvider {
	const log = createChildLogger({ module: "tracked-provider" });

	return {
		async chat(messages: ChatMessage[], options: LLMOptions): Promise<LLMResponse> {
			const response = await provider.chat(messages, options);

			try {
				await tracker.recordUsage(
					userId,
					response.model,
					response.usage.inputTokens,
					response.usage.outputTokens,
				);
			} catch (error: unknown) {
				log.warn({ userId, error }, "failed to record token usage");
			}

			return response;
		},

		async embed(text: string, model: string): Promise<number[]> {
			return provider.embed(text, model);
		},
	};
}

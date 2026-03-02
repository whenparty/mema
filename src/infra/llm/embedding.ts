import type { AppEnv } from "@/shared/env";
import { getLlmModels } from "@/shared/env";
import { createChildLogger } from "@/shared/logger";
import { getProviderForModel } from "./provider-factory";
import { withRetry } from "./retry";

export interface EmbeddingService {
	embedText(text: string): Promise<number[]>;
	embedBatch(texts: string[]): Promise<number[][]>;
}

interface EmbeddingServiceConfig {
	env: AppEnv;
	model?: string;
}

export function createEmbeddingService(config: EmbeddingServiceConfig): EmbeddingService {
	const model = config.model ?? getLlmModels().embedding;
	const provider = getProviderForModel(model, config.env);
	const log = createChildLogger({ module: "embedding" });

	return {
		async embedText(text: string): Promise<number[]> {
			log.debug({ model, textLength: text.length }, "generating embedding");
			return withRetry(() => provider.embed(text, model));
		},

		async embedBatch(texts: string[]): Promise<number[][]> {
			if (texts.length === 0) {
				return [];
			}
			log.debug({ model, count: texts.length }, "generating batch embeddings");
			return Promise.all(texts.map((text) => withRetry(() => provider.embed(text, model))));
		},
	};
}

import type { AppEnv, LlmModels } from "@/shared/env";
import { getLlmModels } from "@/shared/env";
import { EmbeddingServiceError, LlmApiError } from "@/shared/errors";
import { createChildLogger } from "@/shared/logger";
import { getProviderForModel } from "./provider-factory";
import type { RetryOptions } from "./retry";
import { withRetry } from "./retry";

export interface EmbeddingService {
	embedText(text: string): Promise<number[]>;
	embedBatch(texts: string[]): Promise<number[][]>;
}

export interface EmbeddingServiceOptions {
	getModels?: () => LlmModels;
	retryOptions?: Partial<RetryOptions>;
}

function isFiniteVector(value: unknown): value is number[] {
	if (!Array.isArray(value) || value.length === 0) {
		return false;
	}
	for (const element of value) {
		if (typeof element !== "number" || !Number.isFinite(element)) {
			return false;
		}
	}
	return true;
}

function validateInputText(text: string, model: string, inputIndex?: number): string {
	const trimmed = text.trim();
	if (trimmed.length > 0) {
		return trimmed;
	}
	if (inputIndex === undefined) {
		throw new EmbeddingServiceError(
			"Cannot generate embedding for empty text",
			"EMBEDDING_EMPTY_INPUT",
			model,
			false,
			"Provide non-empty text for embedding.",
		);
	}
	throw new EmbeddingServiceError(
		`Cannot generate embedding: batch item at index ${String(inputIndex)} is empty`,
		"EMBEDDING_BATCH_ITEM_EMPTY",
		model,
		false,
		"Remove empty items from batch input.",
		inputIndex,
	);
}

function wrapProviderError(
	error: unknown,
	model: string,
	inputIndex?: number,
): EmbeddingServiceError {
	if (error instanceof EmbeddingServiceError) {
		return error;
	}
	const retryable = error instanceof LlmApiError ? error.isRetryable : true;
	const suffix =
		inputIndex === undefined ? "" : ` for item ${String(inputIndex)} in the embedding batch`;
	return new EmbeddingServiceError(
		`Failed to generate embedding${suffix}`,
		"EMBEDDING_PROVIDER_FAILURE",
		model,
		retryable,
		"Retry if transient; if persistent, verify API key/provider availability and model configuration.",
		inputIndex,
		error,
	);
}

async function embedSingleText(
	text: string,
	model: string,
	env: AppEnv,
	retryOptions: Partial<RetryOptions> | undefined,
	log: ReturnType<typeof createChildLogger>,
	inputIndex?: number,
): Promise<number[]> {
	const validText = validateInputText(text, model, inputIndex);

	try {
		const provider = getProviderForModel(model, env);
		log.debug({ model, textLength: validText.length }, "generating embedding");
		const vector = await withRetry(() => provider.embed(validText, model), retryOptions);

		if (isFiniteVector(vector)) {
			return vector;
		}

		const suffix =
			inputIndex === undefined ? "" : ` for item ${String(inputIndex)} in the embedding batch`;
		throw new EmbeddingServiceError(
			`Provider returned invalid embedding vector${suffix}`,
			"EMBEDDING_INVALID_RESPONSE",
			model,
			false,
			"Verify provider response format and embedding model compatibility.",
			inputIndex,
		);
	} catch (error: unknown) {
		if (error instanceof EmbeddingServiceError) {
			throw error;
		}
		throw wrapProviderError(error, model, inputIndex);
	}
}

export function createEmbeddingService(
	env: AppEnv,
	options: EmbeddingServiceOptions = {},
): EmbeddingService {
	const getModels = options.getModels ?? getLlmModels;
	const log = createChildLogger({ module: "embedding" });

	return {
		async embedText(text: string): Promise<number[]> {
			const model = getModels().embedding;
			return embedSingleText(text, model, env, options.retryOptions, log);
		},

		async embedBatch(texts: string[]): Promise<number[][]> {
			const model = getModels().embedding;
			if (texts.length === 0) {
				throw new EmbeddingServiceError(
					"Cannot generate embeddings for an empty batch",
					"EMBEDDING_EMPTY_BATCH",
					model,
					false,
					"Provide at least one text item.",
				);
			}
			log.debug({ model, count: texts.length }, "generating batch embeddings");
			const results: number[][] = [];
			for (const [index, text] of texts.entries()) {
				const vector = await embedSingleText(text, model, env, options.retryOptions, log, index);
				results.push(vector);
			}
			return results;
		},
	};
}

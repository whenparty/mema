export class LlmApiError extends Error {
	constructor(
		message: string,
		public readonly provider: string,
		public readonly statusCode?: number,
		public readonly isRetryable: boolean = true,
		public readonly cause?: unknown,
	) {
		super(message, { cause });
		this.name = "LlmApiError";
	}
}

export class PromptLoadError extends Error {
	constructor(
		message: string,
		public readonly templateName: string,
		public readonly cause?: unknown,
	) {
		super(message, { cause });
		this.name = "PromptLoadError";
	}
}

export type EmbeddingErrorCode =
	| "EMBEDDING_EMPTY_INPUT"
	| "EMBEDDING_EMPTY_BATCH"
	| "EMBEDDING_BATCH_ITEM_EMPTY"
	| "EMBEDDING_PROVIDER_FAILURE"
	| "EMBEDDING_INVALID_RESPONSE";

export class EmbeddingServiceError extends Error {
	constructor(
		message: string,
		public readonly code: EmbeddingErrorCode,
		public readonly model: string,
		public readonly isRetryable: boolean,
		public readonly action: string,
		public readonly inputIndex?: number,
		public readonly cause?: unknown,
	) {
		super(message, { cause });
		this.name = "EmbeddingServiceError";
	}
}

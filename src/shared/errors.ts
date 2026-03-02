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

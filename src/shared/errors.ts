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

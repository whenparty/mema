import { createChildLogger } from "@/shared/logger";

const retryLogger = createChildLogger({ module: "llm-retry" });

export interface RetryOptions {
	maxAttempts: number;
	initialDelayMs: number;
	backoffMultiplier: number;
}

const DEFAULT_OPTIONS: RetryOptions = {
	maxAttempts: 3,
	initialDelayMs: 1000,
	backoffMultiplier: 2,
};

function isNonRetryable(error: unknown): boolean {
	if (
		typeof error === "object" &&
		error !== null &&
		"isRetryable" in error &&
		(error as { isRetryable: boolean }).isRetryable === false
	) {
		return true;
	}
	return false;
}

function delay(ms: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function withRetry<T>(
	operation: () => Promise<T>,
	options?: Partial<RetryOptions>,
): Promise<T> {
	const resolved: RetryOptions = { ...DEFAULT_OPTIONS, ...options };
	let lastError: unknown;

	for (let attempt = 1; attempt <= resolved.maxAttempts; attempt++) {
		try {
			return await operation();
		} catch (error: unknown) {
			lastError = error;

			if (isNonRetryable(error)) {
				throw error;
			}

			if (attempt === resolved.maxAttempts) {
				break;
			}

			const delayMs = resolved.initialDelayMs * resolved.backoffMultiplier ** (attempt - 1);

			retryLogger.warn(
				{ attempt, maxAttempts: resolved.maxAttempts, delayMs },
				"LLM call failed, retrying",
			);

			await delay(delayMs);
		}
	}

	throw lastError;
}

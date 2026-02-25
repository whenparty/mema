import { LlmApiError } from "@/shared/errors";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { withRetry } from "../retry";

describe("withRetry", () => {
	beforeEach(() => {
		vi.useFakeTimers();
	});

	afterEach(() => {
		vi.useRealTimers();
	});

	it("succeeds on first attempt without retrying", async () => {
		const operation = vi.fn().mockResolvedValue("success");

		const result = await withRetry(operation);

		expect(result).toBe("success");
		expect(operation).toHaveBeenCalledTimes(1);
	});

	it("retries on failure and succeeds on second attempt", async () => {
		const operation = vi
			.fn()
			.mockRejectedValueOnce(new Error("transient error"))
			.mockResolvedValue("success");

		const promise = withRetry(operation);

		// Advance past the first retry delay (1000ms)
		await vi.advanceTimersByTimeAsync(1000);

		const result = await promise;
		expect(result).toBe("success");
		expect(operation).toHaveBeenCalledTimes(2);
	});

	it("respects maxAttempts and throws last error after all attempts", async () => {
		const error = new Error("persistent error");
		const operation = vi.fn().mockRejectedValue(error);

		const promise = withRetry(operation, { maxAttempts: 3 }).catch((err: unknown) => err);

		// Advance past delay 1 (1000ms) and delay 2 (2000ms)
		await vi.advanceTimersByTimeAsync(1000);
		await vi.advanceTimersByTimeAsync(2000);

		const result = await promise;
		expect(result).toBe(error);
		expect(operation).toHaveBeenCalledTimes(3);
	});

	it("applies exponential backoff delays", async () => {
		const operation = vi
			.fn()
			.mockRejectedValueOnce(new Error("fail 1"))
			.mockRejectedValueOnce(new Error("fail 2"))
			.mockRejectedValueOnce(new Error("fail 3"))
			.mockResolvedValue("success");

		const promise = withRetry(operation, {
			maxAttempts: 4,
			initialDelayMs: 100,
			backoffMultiplier: 2,
		});

		// After 99ms, still only 1 call
		await vi.advanceTimersByTimeAsync(99);
		expect(operation).toHaveBeenCalledTimes(1);

		// After 100ms total, second attempt fires
		await vi.advanceTimersByTimeAsync(1);
		expect(operation).toHaveBeenCalledTimes(2);

		// After 200ms more (300ms total from start), third attempt fires
		await vi.advanceTimersByTimeAsync(200);
		expect(operation).toHaveBeenCalledTimes(3);

		// After 400ms more (700ms total from start), fourth attempt fires
		await vi.advanceTimersByTimeAsync(400);
		expect(operation).toHaveBeenCalledTimes(4);

		const result = await promise;
		expect(result).toBe("success");
	});

	it("does not retry when error has isRetryable === false", async () => {
		const error = new LlmApiError("bad request", "openai", 400, false);
		const operation = vi.fn().mockRejectedValue(error);

		await expect(withRetry(operation)).rejects.toThrow("bad request");
		expect(operation).toHaveBeenCalledTimes(1);
	});

	it("retries when error has isRetryable === true", async () => {
		const error = new LlmApiError("rate limited", "openai", 429, true);
		const operation = vi.fn().mockRejectedValueOnce(error).mockResolvedValue("recovered");

		const promise = withRetry(operation);
		await vi.advanceTimersByTimeAsync(1000);

		const result = await promise;
		expect(result).toBe("recovered");
		expect(operation).toHaveBeenCalledTimes(2);
	});

	it("uses default options when none provided", async () => {
		const operation = vi
			.fn()
			.mockRejectedValueOnce(new Error("fail 1"))
			.mockRejectedValueOnce(new Error("fail 2"))
			.mockResolvedValue("success");

		const promise = withRetry(operation);

		// Default: 1000ms first delay
		await vi.advanceTimersByTimeAsync(1000);
		expect(operation).toHaveBeenCalledTimes(2);

		// Default: 2000ms second delay (1000 * 2)
		await vi.advanceTimersByTimeAsync(2000);
		expect(operation).toHaveBeenCalledTimes(3);

		const result = await promise;
		expect(result).toBe("success");
	});

	it("retries generic errors (non-LlmApiError)", async () => {
		const operation = vi
			.fn()
			.mockRejectedValueOnce(new TypeError("network failure"))
			.mockResolvedValue("recovered");

		const promise = withRetry(operation);
		await vi.advanceTimersByTimeAsync(1000);

		const result = await promise;
		expect(result).toBe("recovered");
		expect(operation).toHaveBeenCalledTimes(2);
	});
});

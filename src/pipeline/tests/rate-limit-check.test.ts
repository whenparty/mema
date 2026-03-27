import type { MessageInput } from "@/shared/types";
import type pino from "pino";
import { describe, expect, it, vi } from "vitest";
import type { RateLimiter } from "../rate-limiter";
import { RATE_LIMIT_WARNING, createRateLimitStep } from "../steps/rate-limit-check";
import type { PipelineContext } from "../types";

const TEST_INPUT: MessageInput = {
	text: "Hello there",
	externalUserId: "user-123",
	username: "testuser",
	firstName: "Test",
	languageCode: "en",
	platformUpdateId: 42,
};

function createTestContext(overrides?: Partial<PipelineContext>): PipelineContext {
	return {
		input: TEST_INPUT,
		stepTimings: {},
		...overrides,
	};
}

const createMockLog = () =>
	({
		debug: vi.fn(),
		info: vi.fn(),
		warn: vi.fn(),
		error: vi.fn(),
	}) as unknown as pino.Logger;

function createMockLimiter(admitted: boolean): RateLimiter {
	return {
		tryAdmit: vi.fn().mockReturnValue(admitted),
		getRemainingCapacity: vi.fn().mockReturnValue(0),
	};
}

describe("createRateLimitStep", () => {
	it("does not set earlyResponse when message is admitted", async () => {
		const limiter = createMockLimiter(true);
		const step = createRateLimitStep({ limiter });
		const ctx = createTestContext();
		const log = createMockLog();

		await step(ctx, log);

		expect(ctx.earlyResponse).toBeUndefined();
	});

	it("sets earlyResponse to warning copy when message is rejected", async () => {
		const limiter = createMockLimiter(false);
		const step = createRateLimitStep({ limiter });
		const ctx = createTestContext();
		const log = createMockLog();

		await step(ctx, log);

		expect(ctx.earlyResponse).toBe(RATE_LIMIT_WARNING);
	});

	it("emits warn-level log with externalUserId on rejection", async () => {
		const limiter = createMockLimiter(false);
		const step = createRateLimitStep({ limiter });
		const ctx = createTestContext();
		const log = createMockLog();

		await step(ctx, log);

		expect(log.warn).toHaveBeenCalledOnce();
		expect(log.warn).toHaveBeenCalledWith(
			{ externalUserId: "user-123", event: "rate_limit_exceeded" },
			"rate limit exceeded",
		);
	});

	it("does not emit warn log when message is admitted", async () => {
		const limiter = createMockLimiter(true);
		const step = createRateLimitStep({ limiter });
		const ctx = createTestContext();
		const log = createMockLog();

		await step(ctx, log);

		expect(log.warn).not.toHaveBeenCalled();
	});

	it("passes ctx.input.externalUserId to limiter.tryAdmit", async () => {
		const limiter = createMockLimiter(true);
		const step = createRateLimitStep({ limiter });
		const ctx = createTestContext();
		const log = createMockLog();

		await step(ctx, log);

		expect(limiter.tryAdmit).toHaveBeenCalledWith("user-123");
	});
});

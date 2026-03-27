import type { MessageInput } from "@/shared/types";
import type pino from "pino";
import { describe, expect, it, vi } from "vitest";
import {
	QUOTA_EXCEEDED_WARNING,
	type QuotaCheckResult,
	type TokenQuotaStepDeps,
	createTokenQuotaStep,
	getNextPeriodStart,
} from "../steps/token-quota-check";
import type { PipelineContext } from "../types";

const TEST_INPUT: MessageInput = {
	text: "Hello there",
	externalUserId: "tg-user-123",
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

function createMockDeps(overrides?: Partial<TokenQuotaStepDeps>): TokenQuotaStepDeps {
	return {
		resolveUserId: vi.fn().mockResolvedValue("internal-user-id"),
		checkQuota: vi.fn().mockResolvedValue({
			exceeded: false,
			tokensUsed: 500,
			quotaLimit: 100_000,
			periodStart: new Date("2026-03-01T00:00:00Z"),
		} satisfies QuotaCheckResult),
		notifyAdmin: vi.fn().mockResolvedValue(undefined),
		...overrides,
	};
}

describe("createTokenQuotaStep", () => {
	it("does not set earlyResponse when under quota", async () => {
		const deps = createMockDeps();
		const step = createTokenQuotaStep(deps);
		const ctx = createTestContext();
		const log = createMockLog();

		await step(ctx, log);

		expect(ctx.earlyResponse).toBeUndefined();
		expect(deps.notifyAdmin).not.toHaveBeenCalled();
	});

	it("does not set earlyResponse when quotaLimit is 0 (unlimited)", async () => {
		const deps = createMockDeps({
			checkQuota: vi.fn().mockResolvedValue({
				exceeded: false,
				tokensUsed: 999_999,
				quotaLimit: 0,
				periodStart: new Date("2026-03-01T00:00:00Z"),
			} satisfies QuotaCheckResult),
		});
		const step = createTokenQuotaStep(deps);
		const ctx = createTestContext();
		const log = createMockLog();

		await step(ctx, log);

		expect(ctx.earlyResponse).toBeUndefined();
		expect(deps.notifyAdmin).not.toHaveBeenCalled();
	});

	it("skips check when resolveUserId returns null (unknown user)", async () => {
		const deps = createMockDeps({
			resolveUserId: vi.fn().mockResolvedValue(null),
		});
		const step = createTokenQuotaStep(deps);
		const ctx = createTestContext();
		const log = createMockLog();

		await step(ctx, log);

		expect(ctx.earlyResponse).toBeUndefined();
		expect(deps.checkQuota).not.toHaveBeenCalled();
		expect(deps.notifyAdmin).not.toHaveBeenCalled();
	});

	it("sets earlyResponse and calls notifyAdmin when quota exceeded", async () => {
		const deps = createMockDeps({
			checkQuota: vi.fn().mockResolvedValue({
				exceeded: true,
				tokensUsed: 100_500,
				quotaLimit: 100_000,
				periodStart: new Date("2026-03-01T00:00:00Z"),
			} satisfies QuotaCheckResult),
		});
		const step = createTokenQuotaStep(deps);
		const ctx = createTestContext();
		const log = createMockLog();

		await step(ctx, log);

		expect(ctx.earlyResponse).toBeDefined();
		expect(ctx.earlyResponse).toContain("April 1, 2026");
		expect(deps.notifyAdmin).toHaveBeenCalledOnce();
	});

	it("emits warn log with metadata on quota exceeded", async () => {
		const deps = createMockDeps({
			checkQuota: vi.fn().mockResolvedValue({
				exceeded: true,
				tokensUsed: 100_500,
				quotaLimit: 100_000,
				periodStart: new Date("2026-03-01T00:00:00Z"),
			} satisfies QuotaCheckResult),
		});
		const step = createTokenQuotaStep(deps);
		const ctx = createTestContext();
		const log = createMockLog();

		await step(ctx, log);

		expect(log.warn).toHaveBeenCalledOnce();
		const [metadata] = (log.warn as ReturnType<typeof vi.fn>).mock.calls[0];
		expect(metadata).toHaveProperty("event", "token_quota_exceeded");
		expect(metadata).toHaveProperty("externalUserId", "tg-user-123");
		expect(metadata).toHaveProperty("tokensUsed", 100_500);
		expect(metadata).toHaveProperty("quotaLimit", 100_000);
		expect(metadata).not.toHaveProperty("text");
	});

	it("does not throw when notifyAdmin fails", async () => {
		const deps = createMockDeps({
			checkQuota: vi.fn().mockResolvedValue({
				exceeded: true,
				tokensUsed: 100_500,
				quotaLimit: 100_000,
				periodStart: new Date("2026-03-01T00:00:00Z"),
			} satisfies QuotaCheckResult),
			notifyAdmin: vi.fn().mockRejectedValue(new Error("Bot not ready")),
		});
		const step = createTokenQuotaStep(deps);
		const ctx = createTestContext();
		const log = createMockLog();

		await step(ctx, log);

		expect(ctx.earlyResponse).toBeDefined();
		expect(log.warn).toHaveBeenCalledTimes(2);
	});

	it("passes externalUserId to resolveUserId", async () => {
		const deps = createMockDeps();
		const step = createTokenQuotaStep(deps);
		const ctx = createTestContext();
		const log = createMockLog();

		await step(ctx, log);

		expect(deps.resolveUserId).toHaveBeenCalledWith("tg-user-123");
	});

	it("passes internal userId to checkQuota", async () => {
		const deps = createMockDeps();
		const step = createTokenQuotaStep(deps);
		const ctx = createTestContext();
		const log = createMockLog();

		await step(ctx, log);

		expect(deps.checkQuota).toHaveBeenCalledWith("internal-user-id");
	});

	it("sets ctx.userId after resolving internal user id", async () => {
		const deps = createMockDeps();
		const step = createTokenQuotaStep(deps);
		const ctx = createTestContext();
		const log = createMockLog();

		await step(ctx, log);

		expect(ctx.userId).toBe("internal-user-id");
	});

	it("does not block when quotaLimit is 0 even if exceeded is true (defense-in-depth)", async () => {
		const deps = createMockDeps({
			checkQuota: vi.fn().mockResolvedValue({
				exceeded: true,
				tokensUsed: 999_999,
				quotaLimit: 0,
				periodStart: new Date("2026-03-01T00:00:00Z"),
			} satisfies QuotaCheckResult),
		});
		const step = createTokenQuotaStep(deps);
		const ctx = createTestContext();
		const log = createMockLog();

		await step(ctx, log);

		expect(ctx.earlyResponse).toBeUndefined();
		expect(deps.notifyAdmin).not.toHaveBeenCalled();
	});

	it("sends admin notification with userId and token counts", async () => {
		const deps = createMockDeps({
			checkQuota: vi.fn().mockResolvedValue({
				exceeded: true,
				tokensUsed: 100_500,
				quotaLimit: 100_000,
				periodStart: new Date("2026-03-01T00:00:00Z"),
			} satisfies QuotaCheckResult),
		});
		const step = createTokenQuotaStep(deps);
		const ctx = createTestContext();
		const log = createMockLog();

		await step(ctx, log);

		expect(deps.notifyAdmin).toHaveBeenCalledWith(expect.stringContaining("internal-user-id"));
		expect(deps.notifyAdmin).toHaveBeenCalledWith(expect.stringContaining("100500"));
	});
});

describe("getNextPeriodStart", () => {
	it("returns first day of next month for mid-month date", () => {
		const result = getNextPeriodStart(new Date("2026-03-15T00:00:00Z"));
		expect(result).toEqual(new Date("2026-04-01T00:00:00Z"));
	});

	it("wraps to January for December", () => {
		const result = getNextPeriodStart(new Date("2026-12-01T00:00:00Z"));
		expect(result).toEqual(new Date("2027-01-01T00:00:00Z"));
	});
});

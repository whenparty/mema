import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createTokenTracker, getCurrentPeriodStart } from "../token-tracker";

// Mock the DB query functions
vi.mock("@/infra/db/queries/token-usage", () => ({
	upsertTokenUsage: vi.fn(),
	getTokenUsage: vi.fn(),
}));

// Mock the logger
vi.mock("@/shared/logger", () => {
	const childLogger = {
		info: vi.fn(),
		warn: vi.fn(),
		error: vi.fn(),
		debug: vi.fn(),
	};
	return {
		createChildLogger: vi.fn(() => childLogger),
		_childLogger: childLogger,
	};
});

import { getTokenUsage, upsertTokenUsage } from "@/infra/db/queries/token-usage";
import * as loggerModule from "@/shared/logger";

const mockUpsert = vi.mocked(upsertTokenUsage);
const mockGetUsage = vi.mocked(getTokenUsage);
const mockChildLogger = (
	loggerModule as unknown as { _childLogger: Record<string, ReturnType<typeof vi.fn>> }
)._childLogger;

describe("getCurrentPeriodStart", () => {
	beforeEach(() => {
		vi.useFakeTimers();
	});

	afterEach(() => {
		vi.useRealTimers();
	});

	it("returns first day of current month UTC", () => {
		vi.setSystemTime(new Date("2026-02-15T14:30:00.000Z"));

		const result = getCurrentPeriodStart();

		expect(result).toEqual(new Date("2026-02-01T00:00:00.000Z"));
	});

	it("handles year boundary (January)", () => {
		vi.setSystemTime(new Date("2026-01-20T08:00:00.000Z"));

		const result = getCurrentPeriodStart();

		expect(result).toEqual(new Date("2026-01-01T00:00:00.000Z"));
	});

	it("handles last day of month", () => {
		vi.setSystemTime(new Date("2026-03-31T23:59:59.999Z"));

		const result = getCurrentPeriodStart();

		expect(result).toEqual(new Date("2026-03-01T00:00:00.000Z"));
	});
});

describe("createTokenTracker", () => {
	const mockDb = {} as never;
	const defaultQuotaLimit = 100000;

	beforeEach(() => {
		vi.useFakeTimers();
		vi.setSystemTime(new Date("2026-02-15T12:00:00.000Z"));
		vi.clearAllMocks();
	});

	afterEach(() => {
		vi.useRealTimers();
	});

	describe("recordUsage", () => {
		it("calls upsert with correct params including defaultQuotaLimit", async () => {
			mockUpsert.mockResolvedValue({
				id: "row-1",
				userId: "user-1",
				periodStart: new Date("2026-02-01"),
				tokensUsed: 750,
				quotaLimit: defaultQuotaLimit,
				updatedAt: new Date(),
			});
			const tracker = createTokenTracker({ db: mockDb, defaultQuotaLimit });

			await tracker.recordUsage("user-1", "gpt-5-mini", 500, 250);

			expect(mockUpsert).toHaveBeenCalledWith(mockDb, {
				userId: "user-1",
				tokensToAdd: 750,
				periodStart: new Date("2026-02-01T00:00:00.000Z"),
				quotaLimit: defaultQuotaLimit,
			});
		});

		it("logs structured token data (AC6)", async () => {
			mockUpsert.mockResolvedValue({
				id: "row-1",
				userId: "user-1",
				periodStart: new Date("2026-02-01"),
				tokensUsed: 750,
				quotaLimit: defaultQuotaLimit,
				updatedAt: new Date(),
			});
			const tracker = createTokenTracker({ db: mockDb, defaultQuotaLimit });

			await tracker.recordUsage("user-1", "gpt-5-mini", 500, 250);

			expect(mockChildLogger.info).toHaveBeenCalledWith(
				expect.objectContaining({
					userId: "user-1",
					model: "gpt-5-mini",
					inputTokens: 500,
					outputTokens: 250,
					totalTokens: 750,
				}),
				expect.any(String),
			);
		});
	});

	describe("checkQuota", () => {
		it("returns exceeded: false when no record exists", async () => {
			mockGetUsage.mockResolvedValue(null);
			const tracker = createTokenTracker({ db: mockDb, defaultQuotaLimit });

			const result = await tracker.checkQuota("user-1");

			expect(result).toEqual({
				exceeded: false,
				tokensUsed: 0,
				quotaLimit: defaultQuotaLimit,
				periodStart: new Date("2026-02-01T00:00:00.000Z"),
			});
		});

		it("returns exceeded: true when tokensUsed >= quotaLimit", async () => {
			mockGetUsage.mockResolvedValue({
				id: "row-1",
				userId: "user-1",
				periodStart: new Date("2026-02-01"),
				tokensUsed: 100000,
				quotaLimit: 100000,
				updatedAt: new Date(),
			});
			const tracker = createTokenTracker({ db: mockDb, defaultQuotaLimit });

			const result = await tracker.checkQuota("user-1");

			expect(result.exceeded).toBe(true);
			expect(result.tokensUsed).toBe(100000);
			expect(result.quotaLimit).toBe(100000);
		});

		it("returns exceeded: false when tokensUsed < quotaLimit", async () => {
			mockGetUsage.mockResolvedValue({
				id: "row-1",
				userId: "user-1",
				periodStart: new Date("2026-02-01"),
				tokensUsed: 50000,
				quotaLimit: 100000,
				updatedAt: new Date(),
			});
			const tracker = createTokenTracker({ db: mockDb, defaultQuotaLimit });

			const result = await tracker.checkQuota("user-1");

			expect(result.exceeded).toBe(false);
			expect(result.tokensUsed).toBe(50000);
		});

		it("returns exceeded: false when quotaLimit === 0 (unlimited)", async () => {
			mockGetUsage.mockResolvedValue({
				id: "row-1",
				userId: "user-1",
				periodStart: new Date("2026-02-01"),
				tokensUsed: 999999,
				quotaLimit: 0,
				updatedAt: new Date(),
			});
			const tracker = createTokenTracker({ db: mockDb, defaultQuotaLimit });

			const result = await tracker.checkQuota("user-1");

			expect(result.exceeded).toBe(false);
		});
	});

	describe("getUsage", () => {
		it("returns token usage record when found", async () => {
			const record = {
				id: "row-1",
				userId: "user-1",
				periodStart: new Date("2026-02-01"),
				tokensUsed: 5000,
				quotaLimit: 100000,
				updatedAt: new Date("2026-02-15"),
			};
			mockGetUsage.mockResolvedValue(record);
			const tracker = createTokenTracker({ db: mockDb, defaultQuotaLimit });

			const result = await tracker.getUsage("user-1");

			expect(result).toEqual(record);
		});

		it("returns null when no record found", async () => {
			mockGetUsage.mockResolvedValue(null);
			const tracker = createTokenTracker({ db: mockDb, defaultQuotaLimit });

			const result = await tracker.getUsage("user-1");

			expect(result).toBeNull();
		});
	});
});

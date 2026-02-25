import { createChildLogger } from "@/shared/logger";
import type { Context, NextFunction } from "grammy";
import type { Mock } from "vitest";
import { describe, expect, it, vi } from "vitest";
import type { DuplicateChecker } from "../../types";
import { createDedupGuard } from "../dedup-guard";

// Mock logger — must be defined inside the factory because vi.mock is hoisted
vi.mock("@/shared/logger", () => {
	const mockLogger = {
		info: vi.fn(),
		warn: vi.fn(),
		error: vi.fn(),
		debug: vi.fn(),
		child: vi.fn().mockReturnThis(),
	};
	return {
		createChildLogger: vi.fn().mockReturnValue(mockLogger),
		logger: mockLogger,
	};
});

/** Retrieve the mock logger returned by the mocked createChildLogger */
function getMockLogger() {
	return (createChildLogger as Mock).mock.results[0].value as Record<string, Mock>;
}

function createMockContext(userId?: number, updateId = 100): Context {
	if (userId === undefined) {
		return {
			from: undefined,
			update: { update_id: updateId },
		} as unknown as Context;
	}
	return {
		from: { id: userId },
		update: { update_id: updateId },
	} as unknown as Context;
}

describe("createDedupGuard", () => {
	it("calls next() when checker returns false (first-time processing)", async () => {
		const isDuplicate: DuplicateChecker = vi.fn().mockResolvedValue(false);
		const { middleware } = createDedupGuard(isDuplicate);
		const ctx = createMockContext(42, 100);
		const next: NextFunction = vi.fn().mockResolvedValue(undefined);

		await middleware(ctx, next);

		expect(isDuplicate).toHaveBeenCalledWith("42", 100);
		expect(next).toHaveBeenCalledOnce();
	});

	it("skips next() when checker returns true (duplicate detected)", async () => {
		const isDuplicate: DuplicateChecker = vi.fn().mockResolvedValue(true);
		const { middleware } = createDedupGuard(isDuplicate);
		const ctx = createMockContext(42, 200);
		const next: NextFunction = vi.fn().mockResolvedValue(undefined);

		await middleware(ctx, next);

		expect(isDuplicate).toHaveBeenCalledWith("42", 200);
		expect(next).not.toHaveBeenCalled();
	});

	it("logs a warning when duplicate is detected", async () => {
		const isDuplicate: DuplicateChecker = vi.fn().mockResolvedValue(true);
		const { middleware } = createDedupGuard(isDuplicate);
		const ctx = createMockContext(42, 300);
		const next: NextFunction = vi.fn().mockResolvedValue(undefined);

		const logger = getMockLogger();
		logger.warn.mockClear();
		await middleware(ctx, next);

		expect(logger.warn).toHaveBeenCalledWith(
			{ telegramUserId: "42", updateId: 300 },
			"duplicate update detected, skipping",
		);
	});

	it("calls next() when ctx.from is undefined (passes through)", async () => {
		const isDuplicate: DuplicateChecker = vi.fn().mockResolvedValue(false);
		const { middleware } = createDedupGuard(isDuplicate);
		const ctx = createMockContext(undefined, 400);
		const next: NextFunction = vi.fn().mockResolvedValue(undefined);

		await middleware(ctx, next);

		expect(isDuplicate).not.toHaveBeenCalled();
		expect(next).toHaveBeenCalledOnce();
	});

	it("propagates errors from the checker", async () => {
		const checkerError = new Error("DB connection failed");
		const isDuplicate: DuplicateChecker = vi.fn().mockRejectedValue(checkerError);
		const { middleware } = createDedupGuard(isDuplicate);
		const ctx = createMockContext(42, 500);
		const next: NextFunction = vi.fn().mockResolvedValue(undefined);

		await expect(middleware(ctx, next)).rejects.toThrow("DB connection failed");
		expect(next).not.toHaveBeenCalled();
	});

	it("converts numeric user ID to string for the checker", async () => {
		const isDuplicate: DuplicateChecker = vi.fn().mockResolvedValue(false);
		const { middleware } = createDedupGuard(isDuplicate);
		const ctx = createMockContext(987654321, 600);
		const next: NextFunction = vi.fn().mockResolvedValue(undefined);

		await middleware(ctx, next);

		expect(isDuplicate).toHaveBeenCalledWith("987654321", 600);
	});
});

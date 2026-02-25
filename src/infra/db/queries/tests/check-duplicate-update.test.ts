import { describe, expect, it, vi } from "vitest";
import { createDuplicateChecker } from "../check-duplicate-update";

// Mock drizzle query builder chain
function createMockDb(options: {
	userAuth?: { userId: string } | undefined;
	message?: { id: string } | undefined;
}) {
	const db = {
		select: vi.fn().mockReturnThis(),
		from: vi.fn().mockReturnThis(),
		where: vi.fn().mockImplementation(() => {
			// Track which table we're querying to return appropriate results
			const lastFromCall = db.from.mock.calls[db.from.mock.calls.length - 1];
			const table = lastFromCall?.[0];

			// If table has 'externalId' column reference, it's userAuths
			if (table?.externalId !== undefined) {
				return options.userAuth ? [options.userAuth] : [];
			}
			// Otherwise it's messages
			return options.message ? [options.message] : [];
		}),
	};
	return db;
}

describe("createDuplicateChecker", () => {
	it("returns false when no user is found for the telegram ID", async () => {
		const db = createMockDb({ userAuth: undefined, message: undefined });
		const checker = createDuplicateChecker(db as never);

		const result = await checker("12345", 100);

		expect(result).toBe(false);
		// Should query userAuths
		expect(db.select).toHaveBeenCalledTimes(1);
	});

	it("returns false when user exists but no matching update_id", async () => {
		const db = createMockDb({
			userAuth: { userId: "user-uuid-1" },
			message: undefined,
		});
		const checker = createDuplicateChecker(db as never);

		const result = await checker("12345", 200);

		expect(result).toBe(false);
		// Should query userAuths + messages
		expect(db.select).toHaveBeenCalledTimes(2);
	});

	it("returns true when user exists and matching update_id found", async () => {
		const db = createMockDb({
			userAuth: { userId: "user-uuid-1" },
			message: { id: "msg-uuid-1" },
		});
		const checker = createDuplicateChecker(db as never);

		const result = await checker("12345", 300);

		expect(result).toBe(true);
		// Should query userAuths + messages
		expect(db.select).toHaveBeenCalledTimes(2);
	});
});

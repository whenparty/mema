import { describe, expect, it, vi } from "vitest";
import { getTokenUsage, upsertTokenUsage } from "../token-usage";

/**
 * Creates a mock Drizzle DB that chains insert/values/onConflictDoUpdate/returning
 * and select/from/where for testing token-usage queries.
 */
function createMockDb(options: {
	returningRow?: Record<string, unknown>;
	selectRow?: Record<string, unknown> | undefined;
}) {
	const insertChain = {
		values: vi.fn().mockReturnThis(),
		onConflictDoUpdate: vi.fn().mockReturnThis(),
		returning: vi.fn().mockResolvedValue(options.returningRow ? [options.returningRow] : []),
	};

	const selectChain = {
		from: vi.fn().mockReturnThis(),
		where: vi.fn().mockResolvedValue(options.selectRow ? [options.selectRow] : []),
	};

	const db = {
		insert: vi.fn().mockReturnValue(insertChain),
		select: vi.fn().mockReturnValue(selectChain),
		_insertChain: insertChain,
		_selectChain: selectChain,
	};

	return db;
}

describe("upsertTokenUsage", () => {
	const baseParams = {
		userId: "user-uuid-1",
		tokensToAdd: 500,
		periodStart: new Date("2026-02-01T00:00:00.000Z"),
		quotaLimit: 100000,
	};

	it("calls insert on the token_usages table", async () => {
		const row = {
			id: "row-uuid-1",
			userId: "user-uuid-1",
			periodStart: new Date("2026-02-01"),
			tokensUsed: 500,
			quotaLimit: 100000,
			updatedAt: new Date(),
		};
		const db = createMockDb({ returningRow: row });

		await upsertTokenUsage(db as never, baseParams);

		expect(db.insert).toHaveBeenCalledTimes(1);
	});

	it("passes correct values including tokensToAdd as initial tokensUsed", async () => {
		const row = {
			id: "row-uuid-1",
			userId: "user-uuid-1",
			periodStart: new Date("2026-02-01"),
			tokensUsed: 500,
			quotaLimit: 100000,
			updatedAt: new Date(),
		};
		const db = createMockDb({ returningRow: row });

		await upsertTokenUsage(db as never, baseParams);

		const valuesCall = db._insertChain.values.mock.calls[0][0];
		expect(valuesCall).toMatchObject({
			userId: "user-uuid-1",
			tokensUsed: 500,
			quotaLimit: 100000,
		});
		expect(valuesCall.periodStart).toEqual(new Date("2026-02-01T00:00:00.000Z"));
	});

	it("includes onConflictDoUpdate for atomic increment", async () => {
		const row = {
			id: "row-uuid-1",
			userId: "user-uuid-1",
			periodStart: new Date("2026-02-01"),
			tokensUsed: 1000,
			quotaLimit: 100000,
			updatedAt: new Date(),
		};
		const db = createMockDb({ returningRow: row });

		await upsertTokenUsage(db as never, baseParams);

		expect(db._insertChain.onConflictDoUpdate).toHaveBeenCalledTimes(1);
		const conflictArg = db._insertChain.onConflictDoUpdate.mock.calls[0][0];
		// Should target the unique index
		expect(conflictArg).toHaveProperty("target");
		// Should have a set clause with tokensUsed and updatedAt
		expect(conflictArg).toHaveProperty("set");
		expect(conflictArg.set).toHaveProperty("tokensUsed");
		expect(conflictArg.set).toHaveProperty("updatedAt");
	});

	it("calls returning() and returns the resulting row", async () => {
		const row = {
			id: "row-uuid-1",
			userId: "user-uuid-1",
			periodStart: new Date("2026-02-01"),
			tokensUsed: 500,
			quotaLimit: 100000,
			updatedAt: new Date(),
		};
		const db = createMockDb({ returningRow: row });

		const result = await upsertTokenUsage(db as never, baseParams);

		expect(db._insertChain.returning).toHaveBeenCalledTimes(1);
		expect(result).toEqual(row);
	});
});

describe("getTokenUsage", () => {
	it("returns the row when found", async () => {
		const row = {
			id: "row-uuid-1",
			userId: "user-uuid-1",
			periodStart: new Date("2026-02-01"),
			tokensUsed: 1500,
			quotaLimit: 100000,
			updatedAt: new Date(),
		};
		const db = createMockDb({ selectRow: row });

		const result = await getTokenUsage(
			db as never,
			"user-uuid-1",
			new Date("2026-02-01T00:00:00.000Z"),
		);

		expect(result).toEqual(row);
	});

	it("returns null when no row found", async () => {
		const db = createMockDb({ selectRow: undefined });

		const result = await getTokenUsage(
			db as never,
			"user-uuid-1",
			new Date("2026-02-01T00:00:00.000Z"),
		);

		expect(result).toBeNull();
	});

	it("queries with user_id filter (NFR-SEC.1)", async () => {
		const db = createMockDb({ selectRow: undefined });

		await getTokenUsage(db as never, "user-uuid-1", new Date("2026-02-01T00:00:00.000Z"));

		// select should be called, then from, then where
		expect(db.select).toHaveBeenCalledTimes(1);
		expect(db._selectChain.from).toHaveBeenCalledTimes(1);
		expect(db._selectChain.where).toHaveBeenCalledTimes(1);
	});
});

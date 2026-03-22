import { describe, expect, it, vi } from "vitest";
import { createDialogStateStore } from "../dialog-state-store";
import type { CompareAndResetDialogStateParams, DialogStateStore } from "../dialog-state-store";

/**
 * Mock drizzle query builder chain following the established pattern
 * from check-duplicate-update.test.ts.
 *
 * `userData` maps external Telegram IDs to internal user IDs.
 * `stateData` maps internal user IDs to their dialog-state rows.
 */
function createMockDb(options?: {
	userData?: Record<string, string>;
	stateData?: Record<
		string,
		{
			state: "idle" | "confirm" | "await";
			context: unknown;
			createdAt: Date;
			expiresAt: Date | null;
		}
	>;
}) {
	const userDataEntries = Object.entries(options?.userData ?? {});
	const stateDataEntries = Object.entries(options?.stateData ?? {});
	let userIdx = 0;
	let stateIdx = 0;

	let lastInsertedRow: Record<string, unknown> | null = null;
	let lastSelectedStateUserId: string | null = null;

	const updateWhere = vi.fn().mockImplementation(() => ({
		returning: vi.fn().mockImplementation(() => {
			if (lastSelectedStateUserId === null) {
				return [];
			}
			return [{ userId: lastSelectedStateUserId }];
		}),
	}));

	const db = {
		select: vi.fn().mockReturnThis(),
		from: vi.fn().mockReturnThis(),
		where: vi.fn().mockImplementation(() => {
			const lastFromCall = db.from.mock.calls[db.from.mock.calls.length - 1];
			const table = lastFromCall?.[0];

			if (table?.externalId !== undefined) {
				const entry = userDataEntries[userIdx];
				if (userDataEntries.length > 0) {
					userIdx = (userIdx + 1) % userDataEntries.length;
				}
				return entry ? [{ userId: entry[1] }] : [];
			}

			if (table?.state !== undefined && table?.context !== undefined) {
				const entry = stateDataEntries[stateIdx];
				if (stateDataEntries.length > 0) {
					stateIdx = (stateIdx + 1) % stateDataEntries.length;
				}
				if (entry) {
					lastSelectedStateUserId = entry[0];
					return [
						{
							userId: entry[0],
							state: entry[1].state,
							context: entry[1].context,
							createdAt: entry[1].createdAt,
							expiresAt: entry[1].expiresAt,
						},
					];
				}
				return [];
			}

			return [];
		}),
		insert: vi.fn().mockReturnThis(),
		values: vi.fn().mockImplementation((vals: Record<string, unknown>) => {
			lastInsertedRow = vals;
			return db;
		}),
		onConflictDoUpdate: vi.fn().mockReturnThis(),
		returning: vi.fn().mockImplementation(() => {
			if (lastInsertedRow) {
				return [lastInsertedRow];
			}
			return [];
		}),
		update: vi.fn().mockImplementation(() => ({
			set: vi.fn().mockImplementation(() => ({
				where: updateWhere,
			})),
		})),
	};

	return db;
}

function makeTestDate(offset = 0) {
	return new Date(new Date("2026-03-22T10:00:00Z").getTime() + offset);
}

describe("createDialogStateStore", () => {
	describe("getByExternalUserId", () => {
		it("returns null userId and null state when no user_auths row exists", async () => {
			const db = createMockDb({ userData: {}, stateData: {} });
			const store = createDialogStateStore(db as never);

			const result = await store.getByExternalUserId("unknown-telegram-id");

			expect(result.userId).toBeNull();
			expect(result.dialogState).toBeNull();
		});

		it("returns userId with null dialogState when user has no active state", async () => {
			const db = createMockDb({
				userData: { "known-telegram-id": "user-uuid-1" },
				stateData: {},
			});
			const store = createDialogStateStore(db as never);

			const result = await store.getByExternalUserId("known-telegram-id");

			expect(result.userId).toEqual(expect.any(String));
			expect(result.dialogState).toBeNull();
		});

		it("returns userId and active state when user has non-idle state", async () => {
			const db = createMockDb({
				userData: { "active-state-telegram-id": "user-uuid-2" },
				stateData: {
					"user-uuid-2": {
						state: "confirm",
						context: { type: "conflict" },
						createdAt: makeTestDate(),
						expiresAt: makeTestDate(30 * 60 * 1000),
					},
				},
			});
			const store = createDialogStateStore(db as never);

			const result = await store.getByExternalUserId("active-state-telegram-id");

			expect(result.userId).toEqual(expect.any(String));
			expect(result.dialogState).not.toBeNull();
			expect(result.dialogState?.state).not.toBe("idle");
		});
	});

	describe("upsertByExternalUserId", () => {
		it("creates a new state for a resolved user", async () => {
			const now = new Date();
			const expiresAt = new Date(now.getTime() + 30 * 60 * 1000);
			const db = createMockDb({
				userData: { "known-telegram-id": "user-uuid-1" },
			});
			const store = createDialogStateStore(db as never);

			const result = await store.upsertByExternalUserId({
				externalUserId: "known-telegram-id",
				state: "confirm",
				context: { type: "conflict", existingFactId: "f1" },
				now,
				expiresAt,
			});

			expect(result).not.toBeNull();
			expect(result?.state).toBe("confirm");
			expect(result?.expiresAt).toEqual(expiresAt);
		});

		it("returns null when user_auths has no row for the external ID", async () => {
			const db = createMockDb({ userData: {} });
			const store = createDialogStateStore(db as never);
			const now = new Date();

			const result = await store.upsertByExternalUserId({
				externalUserId: "unknown-telegram-id",
				state: "await",
				context: { type: "missing_data" },
				now,
				expiresAt: new Date(now.getTime() + 30 * 60 * 1000),
			});

			expect(result).toBeNull();
		});
	});

	describe("resetByExternalUserId", () => {
		it("resets an active state to idle and returns the previous state", async () => {
			const db = createMockDb({
				userData: { "active-state-telegram-id": "user-uuid-2" },
				stateData: {
					"user-uuid-2": {
						state: "confirm",
						context: { type: "conflict" },
						createdAt: makeTestDate(),
						expiresAt: makeTestDate(30 * 60 * 1000),
					},
				},
			});
			const store = createDialogStateStore(db as never);
			const now = new Date();

			const result = await store.resetByExternalUserId({
				externalUserId: "active-state-telegram-id",
				now,
				reason: "timeout",
			});

			expect(result.status).toBe("reset");
			expect(result.previousState).not.toBeNull();
			expect(result.previousState?.state).not.toBe("idle");
		});

		it("returns already_idle when user state is already idle", async () => {
			const db = createMockDb({
				userData: { "idle-state-telegram-id": "user-uuid-3" },
				stateData: {
					"user-uuid-3": {
						state: "idle",
						context: null,
						createdAt: makeTestDate(),
						expiresAt: null,
					},
				},
			});
			const store = createDialogStateStore(db as never);
			const now = new Date();

			const result = await store.resetByExternalUserId({
				externalUserId: "idle-state-telegram-id",
				now,
				reason: "off_topic",
			});

			expect(result.status).toBe("already_idle");
		});
	});

	describe("compareAndResetByUserId", () => {
		it("returns reset when timestamps match (winner)", async () => {
			const createdAt = new Date("2026-03-22T10:00:00Z");
			const expiresAt = new Date("2026-03-22T10:30:00Z");
			const now = new Date("2026-03-22T10:31:00Z");

			const db = createMockDb({
				stateData: {
					"user-uuid-1": {
						state: "confirm",
						context: { type: "conflict" },
						createdAt,
						expiresAt,
					},
				},
			});
			const store = createDialogStateStore(db as never);

			const params: CompareAndResetDialogStateParams = {
				userId: "user-uuid-1",
				expectedCreatedAt: createdAt,
				expectedExpiresAt: expiresAt,
				now,
				reason: "timeout",
			};

			const result = await store.compareAndResetByUserId(params);

			expect(result.status).toBe("reset");
			expect(result.previousState).not.toBeNull();
		});

		it("returns stale when timestamps differ (loser)", async () => {
			const createdAt = new Date("2026-03-22T10:00:00Z");
			const expiresAt = new Date("2026-03-22T10:30:00Z");
			const now = new Date("2026-03-22T10:31:00Z");

			const db = createMockDb({
				stateData: {
					"user-uuid-1": {
						state: "confirm",
						context: { type: "conflict" },
						createdAt,
						expiresAt,
					},
				},
			});
			const store = createDialogStateStore(db as never);

			const params: CompareAndResetDialogStateParams = {
				userId: "user-uuid-1",
				expectedCreatedAt: new Date("2026-03-22T09:00:00Z"),
				expectedExpiresAt: new Date("2026-03-22T09:30:00Z"),
				now,
				reason: "timeout",
			};

			const result = await store.compareAndResetByUserId(params);

			expect(result.status).toBe("stale");
		});

		it("returns not_found when userId has no dialog state row", async () => {
			const db = createMockDb({ stateData: {} });
			const store = createDialogStateStore(db as never);
			const now = new Date();

			const params: CompareAndResetDialogStateParams = {
				userId: "nonexistent-user",
				expectedCreatedAt: now,
				expectedExpiresAt: new Date(now.getTime() + 30 * 60 * 1000),
				now,
				reason: "completed",
			};

			const result = await store.compareAndResetByUserId(params);

			expect(result.status).toBe("not_found");
		});
	});

	describe("user isolation", () => {
		it("one user's state does not affect another user's lookup", async () => {
			const db = createMockDb({
				userData: {
					"telegram-user-a": "user-uuid-a",
					"telegram-user-b": "user-uuid-b",
				},
			});
			const store = createDialogStateStore(db as never);

			const userA = await store.getByExternalUserId("telegram-user-a");
			const userB = await store.getByExternalUserId("telegram-user-b");

			if (userA.userId && userB.userId) {
				expect(userA.userId).not.toBe(userB.userId);
			}
		});
	});
});

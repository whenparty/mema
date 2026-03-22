import { type DbClient, createDbClient } from "@/infra/db/client";
import { createDialogStateStore } from "@/infra/db/queries/dialog-state-store";
import type { DialogStateStore } from "@/infra/db/queries/dialog-state-store";
import { dialogStates } from "@/infra/db/schema/dialog-states";
import { userAuths, users } from "@/infra/db/schema/users";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";

const DATABASE_URL = process.env.DATABASE_URL ?? "postgresql://mema:password@localhost:5432/mema";

const THIRTY_MINUTES_MS = 30 * 60 * 1000;

describe("E2E: Dialog State Store", () => {
	let connection: ReturnType<typeof postgres>;
	let db: DbClient;
	let store: DialogStateStore;

	const testUserIds: string[] = [];

	beforeAll(async () => {
		connection = postgres(DATABASE_URL, { max: 1 });
		await connection.unsafe("CREATE EXTENSION IF NOT EXISTS vector;");

		const migrationDb = drizzle(connection);
		await migrate(migrationDb, { migrationsFolder: "./drizzle" });

		db = createDbClient(DATABASE_URL);
		store = createDialogStateStore(db);
	}, 30_000);

	afterEach(async () => {
		for (const userId of testUserIds) {
			await db.delete(dialogStates).where(eq(dialogStates.userId, userId));
			await db.delete(userAuths).where(eq(userAuths.userId, userId));
			await db.delete(users).where(eq(users.id, userId));
		}
		testUserIds.length = 0;
	});

	afterAll(async () => {
		if (connection) {
			await connection.end();
		}
	});

	async function seedUser(externalId: string): Promise<string> {
		const [user] = await db.insert(users).values({ status: "active" }).returning({ id: users.id });

		await db.insert(userAuths).values({
			userId: user.id,
			provider: "telegram",
			externalId,
		});

		testUserIds.push(user.id);
		return user.id;
	}

	describe("getByExternalUserId — real user_auths resolution", () => {
		it("resolves a known Telegram ID to internal userId with null dialogState when no row exists", async () => {
			const userId = await seedUser("tg-integration-1");

			const result = await store.getByExternalUserId("tg-integration-1");

			expect(result.userId).toBe(userId);
			expect(result.dialogState).toBeNull();
		});

		it("returns null userId when no user_auths row exists for the external ID", async () => {
			const result = await store.getByExternalUserId("nonexistent-telegram-id-xyz");

			expect(result.userId).toBeNull();
			expect(result.dialogState).toBeNull();
		});

		it("returns the active non-idle state after upsert", async () => {
			const userId = await seedUser("tg-integration-2");
			const now = new Date();
			const expiresAt = new Date(now.getTime() + THIRTY_MINUTES_MS);

			await store.upsertByExternalUserId({
				externalUserId: "tg-integration-2",
				state: "confirm",
				context: {
					type: "conflict",
					existingFactId: "f-1",
					existingFactSummary: "Likes tea",
					pendingFactSummary: "Likes coffee",
					resumePayload: {},
				},
				now,
				expiresAt,
			});

			const result = await store.getByExternalUserId("tg-integration-2");

			expect(result.userId).toBe(userId);
			expect(result.dialogState).not.toBeNull();
			expect(result.dialogState?.state).toBe("confirm");
			expect(result.dialogState?.userId).toBe(userId);
			const ctx = result.dialogState?.context as Record<string, unknown>;
			expect(ctx.type).toBe("conflict");
		});
	});

	describe("upsertByExternalUserId — real persistence", () => {
		it("creates a new dialog_states row for a resolved user", async () => {
			await seedUser("tg-upsert-1");
			const now = new Date();
			const expiresAt = new Date(now.getTime() + THIRTY_MINUTES_MS);

			const result = await store.upsertByExternalUserId({
				externalUserId: "tg-upsert-1",
				state: "await",
				context: {
					type: "missing_data",
					originalIntent: "reminder.create",
					missingField: "city",
					resumePayload: { reminderText: "dentist" },
				},
				now,
				expiresAt,
			});

			expect(result).not.toBeNull();
			expect(result?.state).toBe("await");
		});

		it("replaces an existing state via on-conflict-do-update", async () => {
			await seedUser("tg-upsert-2");
			const now = new Date();
			const expiresAt = new Date(now.getTime() + THIRTY_MINUTES_MS);

			await store.upsertByExternalUserId({
				externalUserId: "tg-upsert-2",
				state: "confirm",
				context: {
					type: "conflict",
					existingFactId: "f-1",
					existingFactSummary: "A",
					pendingFactSummary: "B",
					resumePayload: {},
				},
				now,
				expiresAt,
			});

			const later = new Date(now.getTime() + 60_000);
			const laterExpires = new Date(later.getTime() + THIRTY_MINUTES_MS);

			const replaced = await store.upsertByExternalUserId({
				externalUserId: "tg-upsert-2",
				state: "await",
				context: {
					type: "missing_data",
					originalIntent: "chat",
					missingField: "city",
					resumePayload: {},
				},
				now: later,
				expiresAt: laterExpires,
			});

			expect(replaced?.state).toBe("await");

			const lookup = await store.getByExternalUserId("tg-upsert-2");
			expect(lookup.dialogState?.state).toBe("await");
			const ctx = lookup.dialogState?.context as Record<string, unknown>;
			expect(ctx.type).toBe("missing_data");
		});

		it("returns null when user_auths has no row", async () => {
			const result = await store.upsertByExternalUserId({
				externalUserId: "nonexistent-tg-upsert",
				state: "confirm",
				context: { type: "account_delete" },
				now: new Date(),
				expiresAt: new Date(Date.now() + THIRTY_MINUTES_MS),
			});

			expect(result).toBeNull();
		});
	});

	describe("compareAndResetByUserId — optimistic token", () => {
		it("resets when timestamps match (winner path)", async () => {
			const userId = await seedUser("tg-car-1");
			const now = new Date();
			const expiresAt = new Date(now.getTime() + THIRTY_MINUTES_MS);

			await store.upsertByExternalUserId({
				externalUserId: "tg-car-1",
				state: "confirm",
				context: {
					type: "delete",
					deleteMode: "fact",
					targetLabel: "some fact",
					factIds: ["f1"],
					resumePayload: {},
				},
				now,
				expiresAt,
			});

			const result = await store.compareAndResetByUserId({
				userId,
				expectedCreatedAt: now,
				expectedExpiresAt: expiresAt,
				now: new Date(),
				reason: "completed",
			});

			expect(result.status).toBe("reset");
			expect(result.previousState).not.toBeNull();
			expect(result.previousState?.state).toBe("confirm");

			const afterReset = await store.getByExternalUserId("tg-car-1");
			expect(afterReset.dialogState).toBeNull();
		});

		it("returns stale when timestamps do not match (loser path)", async () => {
			const userId = await seedUser("tg-car-2");
			const now = new Date();
			const expiresAt = new Date(now.getTime() + THIRTY_MINUTES_MS);

			await store.upsertByExternalUserId({
				externalUserId: "tg-car-2",
				state: "confirm",
				context: { type: "account_delete" },
				now,
				expiresAt,
			});

			const result = await store.compareAndResetByUserId({
				userId,
				expectedCreatedAt: new Date(now.getTime() - 60_000),
				expectedExpiresAt: new Date(expiresAt.getTime() - 60_000),
				now: new Date(),
				reason: "timeout",
			});

			expect(result.status).toBe("stale");

			const afterStale = await store.getByExternalUserId("tg-car-2");
			expect(afterStale.dialogState).not.toBeNull();
		});

		it("returns not_found when no dialog_states row exists for userId", async () => {
			const userId = await seedUser("tg-car-3");
			const now = new Date();

			const result = await store.compareAndResetByUserId({
				userId,
				expectedCreatedAt: now,
				expectedExpiresAt: new Date(now.getTime() + THIRTY_MINUTES_MS),
				now,
				reason: "completed",
			});

			expect(result.status).toBe("not_found");
		});
	});

	describe("resetByExternalUserId — real reset", () => {
		it("clears active state to idle", async () => {
			await seedUser("tg-reset-1");
			const now = new Date();

			await store.upsertByExternalUserId({
				externalUserId: "tg-reset-1",
				state: "await",
				context: {
					type: "entity_disambiguation",
					mention: "Alex",
					candidateEntityIds: ["e-1"],
					candidateOptions: [{ entityId: "e-1", label: "Alex" }],
					pendingFact: {},
				},
				now,
				expiresAt: new Date(now.getTime() + THIRTY_MINUTES_MS),
			});

			const result = await store.resetByExternalUserId({
				externalUserId: "tg-reset-1",
				now: new Date(),
				reason: "off_topic",
			});

			expect(result.status).toBe("reset");
			expect(result.previousState?.state).toBe("await");

			const afterReset = await store.getByExternalUserId("tg-reset-1");
			expect(afterReset.dialogState).toBeNull();
		});
	});

	describe("cross-user isolation", () => {
		it("user A's dialog state does not leak to user B", async () => {
			const userIdA = await seedUser("tg-iso-a");
			const userIdB = await seedUser("tg-iso-b");
			const now = new Date();
			const expiresAt = new Date(now.getTime() + THIRTY_MINUTES_MS);

			await store.upsertByExternalUserId({
				externalUserId: "tg-iso-a",
				state: "confirm",
				context: {
					type: "conflict",
					existingFactId: "f-1",
					existingFactSummary: "A",
					pendingFactSummary: "B",
					resumePayload: {},
				},
				now,
				expiresAt,
			});

			const lookupA = await store.getByExternalUserId("tg-iso-a");
			const lookupB = await store.getByExternalUserId("tg-iso-b");

			expect(lookupA.userId).toBe(userIdA);
			expect(lookupA.dialogState).not.toBeNull();
			expect(lookupA.dialogState?.state).toBe("confirm");

			expect(lookupB.userId).toBe(userIdB);
			expect(lookupB.dialogState).toBeNull();
		});

		it("resetting user A does not affect user B's active state", async () => {
			await seedUser("tg-iso-c");
			await seedUser("tg-iso-d");
			const now = new Date();
			const expiresAt = new Date(now.getTime() + THIRTY_MINUTES_MS);

			await store.upsertByExternalUserId({
				externalUserId: "tg-iso-c",
				state: "confirm",
				context: { type: "account_delete" },
				now,
				expiresAt,
			});
			await store.upsertByExternalUserId({
				externalUserId: "tg-iso-d",
				state: "await",
				context: {
					type: "missing_data",
					originalIntent: "chat",
					missingField: "city",
					resumePayload: {},
				},
				now,
				expiresAt,
			});

			await store.resetByExternalUserId({
				externalUserId: "tg-iso-c",
				now: new Date(),
				reason: "timeout",
			});

			const afterC = await store.getByExternalUserId("tg-iso-c");
			const afterD = await store.getByExternalUserId("tg-iso-d");

			expect(afterC.dialogState).toBeNull();
			expect(afterD.dialogState).not.toBeNull();
			expect(afterD.dialogState?.state).toBe("await");
		});
	});
});

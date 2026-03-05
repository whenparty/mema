import { createDialogStateManager } from "@/domain/dialog/state-manager";
import type { ConflictContext, DialogContext, MissingDataContext } from "@/domain/dialog/types";
import { createDbClient } from "@/infra/db/client";
import type { DbClient } from "@/infra/db/client";
import { createDialogStateStore } from "@/infra/db/queries/dialog-states";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

const DATABASE_URL = process.env.DATABASE_URL ?? "postgresql://mema:password@localhost:5432/mema";

const TEST_USER_IDS: string[] = [];

let connection: ReturnType<typeof postgres>;
let db: DbClient;

async function createTestUser(connection: ReturnType<typeof postgres>): Promise<string> {
	const rows = await connection`
		INSERT INTO users (status) VALUES ('active') RETURNING id
	`;
	const id = String(rows[0].id);
	TEST_USER_IDS.push(id);
	return id;
}

async function cleanupTestUsers(connection: ReturnType<typeof postgres>): Promise<void> {
	for (const userId of TEST_USER_IDS) {
		await connection`DELETE FROM dialog_states WHERE user_id = ${userId}`;
		await connection`DELETE FROM users WHERE id = ${userId}`;
	}
	TEST_USER_IDS.length = 0;
}

beforeAll(async () => {
	connection = postgres(DATABASE_URL, { max: 3 });
	await connection.unsafe("CREATE EXTENSION IF NOT EXISTS vector;");

	const migrationDb = drizzle(connection);
	await migrate(migrationDb, { migrationsFolder: "./drizzle" });

	db = createDbClient(DATABASE_URL);
}, 30_000);

afterAll(async () => {
	await cleanupTestUsers(connection);
	if (connection) {
		await connection.end();
	}
});

describe("E2E: Dialog State — persistence round-trip", () => {
	let userId: string;

	beforeAll(async () => {
		userId = await createTestUser(connection);
	});

	beforeEach(async () => {
		await connection`
			DELETE FROM dialog_states WHERE user_id = ${userId}
		`;
	});

	it("creates state via adapter, loads it, and verifies field match", async () => {
		const store = createDialogStateStore(db);
		const context: ConflictContext = {
			type: "conflict",
			factId: "fact-1",
			existingContent: "Likes cats",
			newContent: "Likes dogs",
		};
		const expiresAt = new Date(Date.now() + 30 * 60 * 1000);

		await store.upsert(userId, "confirm", context, expiresAt);

		const loaded = await store.load(userId);
		expect(loaded).not.toBeNull();
		expect(loaded!.userId).toBe(userId);
		expect(loaded!.state).toBe("confirm");
		expect(loaded!.context).toEqual(context);
		expect(loaded!.expiresAt).toBeDefined();
		expect(loaded!.expiresAt!.getTime()).toBeCloseTo(expiresAt.getTime(), -3);
	});

	it("upserts to update existing state and verifies update persisted", async () => {
		const store = createDialogStateStore(db);
		const initialContext: ConflictContext = {
			type: "conflict",
			factId: "fact-1",
			existingContent: "Likes cats",
			newContent: "Likes dogs",
		};
		await store.upsert(userId, "confirm", initialContext, new Date(Date.now() + 1800000));

		const updatedContext: MissingDataContext = {
			type: "missing_data",
			intent: "reminder.create",
			missingFields: ["time"],
			partialData: { title: "Dentist" },
		};
		await store.upsert(userId, "await", updatedContext, new Date(Date.now() + 1800000));

		const loaded = await store.load(userId);
		expect(loaded).not.toBeNull();
		expect(loaded!.state).toBe("await");
		expect(loaded!.context).toEqual(updatedContext);
	});

	it("resets to idle and verifies state=idle, context=null", async () => {
		const store = createDialogStateStore(db);
		const context: ConflictContext = {
			type: "conflict",
			factId: "fact-1",
			existingContent: "A",
			newContent: "B",
		};
		await store.upsert(userId, "confirm", context, new Date(Date.now() + 1800000));

		await store.resetToIdle(userId);

		const loaded = await store.load(userId);
		expect(loaded).not.toBeNull();
		expect(loaded!.state).toBe("idle");
		expect(loaded!.context).toBeNull();
		expect(loaded!.expiresAt).toBeNull();
	});

	it("returns null for a user with no dialog state row", async () => {
		const store = createDialogStateStore(db);
		const loaded = await store.load(userId);
		expect(loaded).toBeNull();
	});
});

describe("E2E: Dialog State — evaluate flow with real DB", () => {
	let userId: string;

	beforeAll(async () => {
		userId = await createTestUser(connection);
	});

	beforeEach(async () => {
		await connection`
			DELETE FROM dialog_states WHERE user_id = ${userId}
		`;
	});

	it("confirm/conflict + chat intent → continue_dialog", async () => {
		const store = createDialogStateStore(db);
		const manager = createDialogStateManager({ store });
		const context: ConflictContext = {
			type: "conflict",
			factId: "fact-1",
			existingContent: "Likes cats",
			newContent: "Likes dogs",
		};
		await store.upsert(userId, "confirm", context, new Date(Date.now() + 1800000));

		const decision = await manager.evaluateInbound(userId, "chat", "yes I want to update it");

		expect(decision.kind).toBe("continue_dialog");
		if (decision.kind === "continue_dialog") {
			expect(decision.state).toBe("confirm");
			expect(decision.context).toEqual(context);
		}
	});

	it("confirm/conflict + memory.save → reset_off_topic", async () => {
		const store = createDialogStateStore(db);
		const manager = createDialogStateManager({ store });
		const context: ConflictContext = {
			type: "conflict",
			factId: "fact-1",
			existingContent: "Likes cats",
			newContent: "Likes dogs",
		};
		await store.upsert(userId, "confirm", context, new Date(Date.now() + 1800000));

		const decision = await manager.evaluateInbound(
			userId,
			"memory.save",
			"Remember I love pizza",
		);

		expect(decision.kind).toBe("reset_off_topic");
		if (decision.kind === "reset_off_topic") {
			expect(decision.previousState).toBe("confirm");
			expect(decision.previousContextType).toBe("conflict");
		}

		const loaded = await store.load(userId);
		expect(loaded).not.toBeNull();
		expect(loaded!.state).toBe("idle");
		expect(loaded!.context).toBeNull();
	});

	it("confirm/conflict + undefined intent (classifier failure) → continue_dialog", async () => {
		const store = createDialogStateStore(db);
		const manager = createDialogStateManager({ store });
		const context: ConflictContext = {
			type: "conflict",
			factId: "fact-1",
			existingContent: "A",
			newContent: "B",
		};
		await store.upsert(userId, "confirm", context, new Date(Date.now() + 1800000));

		const decision = await manager.evaluateInbound(userId, undefined, "some garbled text");

		expect(decision.kind).toBe("continue_dialog");
	});

	it("idle state + any intent → idle_noop", async () => {
		const store = createDialogStateStore(db);
		const manager = createDialogStateManager({ store });

		const decision = await manager.evaluateInbound(userId, "chat", "Hello");

		expect(decision.kind).toBe("idle_noop");
	});

	it("transitionTo persists state and evaluateInbound reads it", async () => {
		const store = createDialogStateStore(db);
		const manager = createDialogStateManager({ store });
		const context: MissingDataContext = {
			type: "missing_data",
			intent: "reminder.create",
			missingFields: ["time"],
			partialData: { title: "Gym" },
		};

		await manager.transitionTo(userId, "await", context);

		const decision = await manager.evaluateInbound(userId, "chat", "at 5pm");

		expect(decision.kind).toBe("continue_dialog");
		if (decision.kind === "continue_dialog") {
			expect(decision.state).toBe("await");
			expect(decision.context).toEqual(context);
		}
	});
});

describe("E2E: Dialog State — timeout with real persistence", () => {
	let userId: string;

	beforeAll(async () => {
		userId = await createTestUser(connection);
	});

	beforeEach(async () => {
		await connection`
			DELETE FROM dialog_states WHERE user_id = ${userId}
		`;
	});

	it("expired state returns reset_timeout and DB is reset to idle", async () => {
		const store = createDialogStateStore(db);
		const manager = createDialogStateManager({ store });
		const context: ConflictContext = {
			type: "conflict",
			factId: "fact-1",
			existingContent: "A",
			newContent: "B",
		};
		const pastExpiry = new Date(Date.now() - 60_000);
		await store.upsert(userId, "confirm", context, pastExpiry);

		const decision = await manager.evaluateInbound(userId, "chat", "hello");

		expect(decision.kind).toBe("reset_timeout");
		if (decision.kind === "reset_timeout") {
			expect(decision.previousState).toBe("confirm");
			expect(decision.previousContextType).toBe("conflict");
		}

		const loaded = await store.load(userId);
		expect(loaded).not.toBeNull();
		expect(loaded!.state).toBe("idle");
		expect(loaded!.context).toBeNull();
	});

	it("exact boundary (expires_at == now) is treated as expired", async () => {
		const store = createDialogStateStore(db);
		const manager = createDialogStateManager({ store });
		const context: ConflictContext = {
			type: "conflict",
			factId: "fact-1",
			existingContent: "A",
			newContent: "B",
		};
		const now = Date.now();
		await store.upsert(userId, "confirm", context, new Date(now));

		const decision = await manager.evaluateInbound(userId, "chat", "hello", now);

		expect(decision.kind).toBe("reset_timeout");
	});

	it("non-expired state does not trigger timeout", async () => {
		const store = createDialogStateStore(db);
		const manager = createDialogStateManager({ store });
		const context: ConflictContext = {
			type: "conflict",
			factId: "fact-1",
			existingContent: "A",
			newContent: "B",
		};
		const futureExpiry = new Date(Date.now() + 30 * 60 * 1000);
		await store.upsert(userId, "confirm", context, futureExpiry);

		const decision = await manager.evaluateInbound(userId, "chat", "hello");

		expect(decision.kind).toBe("continue_dialog");
	});
});

describe("E2E: Dialog State — context validation with real JSONB", () => {
	let userId: string;

	beforeAll(async () => {
		userId = await createTestUser(connection);
	});

	beforeEach(async () => {
		await connection`
			DELETE FROM dialog_states WHERE user_id = ${userId}
		`;
	});

	it("valid JSON context round-trips through JSONB correctly", async () => {
		const store = createDialogStateStore(db);
		const context: DialogContext = {
			type: "entity_disambiguation",
			entityName: "John",
			candidates: [
				{ id: "e1", name: "John Smith", entityType: "person" },
				{ id: "e2", name: "John Doe", entityType: "person" },
			],
		};
		await store.upsert(userId, "await", context, new Date(Date.now() + 1800000));

		const loaded = await store.load(userId);
		expect(loaded).not.toBeNull();
		expect(loaded!.context).toEqual(context);
	});

	it("malformed JSON in DB returns null context (safe degradation)", async () => {
		await connection`
			INSERT INTO dialog_states (user_id, state, context, created_at)
			VALUES (${userId}, 'confirm', '{"type":"conflict","missing_fields":true}'::jsonb, NOW())
			ON CONFLICT (user_id) DO UPDATE SET
				state = 'confirm',
				context = '{"type":"conflict","missing_fields":true}'::jsonb,
				created_at = NOW()
		`;

		const store = createDialogStateStore(db);
		const loaded = await store.load(userId);

		expect(loaded).not.toBeNull();
		expect(loaded!.state).toBe("confirm");
		expect(loaded!.context).toBeNull();
	});

	it("unknown context type in DB returns null context", async () => {
		await connection`
			INSERT INTO dialog_states (user_id, state, context, created_at)
			VALUES (${userId}, 'confirm', '{"type":"unknown_type","data":"foo"}'::jsonb, NOW())
			ON CONFLICT (user_id) DO UPDATE SET
				state = 'confirm',
				context = '{"type":"unknown_type","data":"foo"}'::jsonb,
				created_at = NOW()
		`;

		const store = createDialogStateStore(db);
		const loaded = await store.load(userId);

		expect(loaded).not.toBeNull();
		expect(loaded!.state).toBe("confirm");
		expect(loaded!.context).toBeNull();
	});

	it("non-idle state with invalid context resets to idle on evaluate", async () => {
		const futureExpiry = new Date(Date.now() + 1800000).toISOString();
		await connection`
			INSERT INTO dialog_states (user_id, state, context, created_at, expires_at)
			VALUES (
				${userId}, 'confirm',
				'{"type":"conflict","missing_fields":true}'::jsonb,
				NOW(),
				${futureExpiry}::timestamptz
			)
			ON CONFLICT (user_id) DO UPDATE SET
				state = 'confirm',
				context = '{"type":"conflict","missing_fields":true}'::jsonb,
				created_at = NOW(),
				expires_at = ${futureExpiry}::timestamptz
		`;

		const store = createDialogStateStore(db);
		const manager = createDialogStateManager({ store });

		const decision = await manager.evaluateInbound(userId, "chat", "hello");

		expect(decision.kind).toBe("idle_noop");

		const loaded = await store.load(userId);
		expect(loaded).not.toBeNull();
		expect(loaded!.state).toBe("idle");
	});
});

describe("E2E: Dialog State — user isolation", () => {
	let userIdA: string;
	let userIdB: string;

	beforeAll(async () => {
		userIdA = await createTestUser(connection);
		userIdB = await createTestUser(connection);
	});

	beforeEach(async () => {
		await connection`DELETE FROM dialog_states WHERE user_id = ${userIdA}`;
		await connection`DELETE FROM dialog_states WHERE user_id = ${userIdB}`;
	});

	it("two users have independent dialog states", async () => {
		const store = createDialogStateStore(db);

		const contextA: ConflictContext = {
			type: "conflict",
			factId: "fact-A",
			existingContent: "User A old",
			newContent: "User A new",
		};
		const contextB: MissingDataContext = {
			type: "missing_data",
			intent: "reminder.create",
			missingFields: ["time"],
			partialData: { title: "Meeting" },
		};

		await store.upsert(userIdA, "confirm", contextA, new Date(Date.now() + 1800000));
		await store.upsert(userIdB, "await", contextB, new Date(Date.now() + 1800000));

		const loadedA = await store.load(userIdA);
		const loadedB = await store.load(userIdB);

		expect(loadedA!.state).toBe("confirm");
		expect(loadedA!.context).toEqual(contextA);
		expect(loadedB!.state).toBe("await");
		expect(loadedB!.context).toEqual(contextB);
	});

	it("resetting one user does not affect the other", async () => {
		const store = createDialogStateStore(db);

		const contextA: ConflictContext = {
			type: "conflict",
			factId: "fact-A",
			existingContent: "A",
			newContent: "B",
		};
		const contextB: ConflictContext = {
			type: "conflict",
			factId: "fact-B",
			existingContent: "C",
			newContent: "D",
		};

		await store.upsert(userIdA, "confirm", contextA, new Date(Date.now() + 1800000));
		await store.upsert(userIdB, "confirm", contextB, new Date(Date.now() + 1800000));

		await store.resetToIdle(userIdA);

		const loadedA = await store.load(userIdA);
		const loadedB = await store.load(userIdB);

		expect(loadedA!.state).toBe("idle");
		expect(loadedA!.context).toBeNull();
		expect(loadedB!.state).toBe("confirm");
		expect(loadedB!.context).toEqual(contextB);
	});

	it("evaluate decisions are isolated between users", async () => {
		const store = createDialogStateStore(db);
		const manager = createDialogStateManager({ store });

		const contextA: ConflictContext = {
			type: "conflict",
			factId: "fact-A",
			existingContent: "A",
			newContent: "B",
		};
		await store.upsert(userIdA, "confirm", contextA, new Date(Date.now() + 1800000));

		const decisionA = await manager.evaluateInbound(userIdA, "chat", "yes");
		const decisionB = await manager.evaluateInbound(userIdB, "chat", "hello");

		expect(decisionA.kind).toBe("continue_dialog");
		expect(decisionB.kind).toBe("idle_noop");
	});
});

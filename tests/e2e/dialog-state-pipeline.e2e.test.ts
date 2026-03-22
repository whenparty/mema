import { type DbClient, createDbClient } from "@/infra/db/client";
import { createDialogStateStore } from "@/infra/db/queries/dialog-state-store";
import { dialogStates } from "@/infra/db/schema/dialog-states";
import { userAuths, users } from "@/infra/db/schema/users";
import { createDialogStateHandlers } from "@/pipeline/dialog-state-handlers";
import { createDialogStateManager } from "@/pipeline/dialog-state-manager";
import { createDialogStateTimeoutScheduler } from "@/pipeline/dialog-state-timeout-scheduler";
import type {
	DialogStateCompletionCallbacks,
	DialogStateNotifier,
} from "@/pipeline/dialog-state-types";
import { FALLBACK_RESPONSE, createPipeline } from "@/pipeline/orchestrator";
import { createDialogStateGateStep } from "@/pipeline/steps/dialog-state-gate";
import { createStubSteps } from "@/pipeline/steps/stubs";
import type { MessageInput } from "@/shared/types";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";

const DATABASE_URL = process.env.DATABASE_URL ?? "postgresql://mema:password@localhost:5432/mema";

const THIRTY_MINUTES_MS = 30 * 60 * 1000;

function makeInput(text: string, externalUserId: string): MessageInput {
	return {
		text,
		externalUserId,
		username: "e2euser",
		firstName: "E2E",
		languageCode: "en",
		platformUpdateId: Math.floor(Math.random() * 100_000),
	};
}

describe("E2E: Dialog State Pipeline Composition", () => {
	let connection: ReturnType<typeof postgres>;
	let db: DbClient;

	const testUserIds: string[] = [];

	beforeAll(async () => {
		connection = postgres(DATABASE_URL, { max: 1 });
		await connection.unsafe("CREATE EXTENSION IF NOT EXISTS vector;");

		const migrationDb = drizzle(connection);
		await migrate(migrationDb, { migrationsFolder: "./drizzle" });

		db = createDbClient(DATABASE_URL);
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

	function buildPipeline(opts?: {
		completionOverrides?: Partial<DialogStateCompletionCallbacks>;
		notifier?: DialogStateNotifier;
		nowFn?: () => Date;
	}) {
		const store = createDialogStateStore(db);
		const handlers = createDialogStateHandlers();
		const scheduler = createDialogStateTimeoutScheduler();

		const completions: DialogStateCompletionCallbacks = {
			conflict:
				opts?.completionOverrides?.conflict ??
				vi.fn().mockResolvedValue({ response: "Conflict resolved." }),
			delete:
				opts?.completionOverrides?.delete ?? vi.fn().mockResolvedValue({ response: "Deleted." }),
			account_delete:
				opts?.completionOverrides?.account_delete ??
				vi.fn().mockResolvedValue({ response: "Account deleted." }),
			interest:
				opts?.completionOverrides?.interest ??
				vi.fn().mockResolvedValue({ response: "Interest saved." }),
			missing_data:
				opts?.completionOverrides?.missing_data ??
				vi.fn().mockResolvedValue({ response: "Got it." }),
			entity_disambiguation:
				opts?.completionOverrides?.entity_disambiguation ??
				vi.fn().mockResolvedValue({ response: "Saved with entity." }),
		};

		const notifier: DialogStateNotifier = opts?.notifier ?? {
			sendTimeoutReset: vi.fn().mockResolvedValue(undefined),
		};

		const classifier = {
			classify: vi.fn().mockResolvedValue({ intent: "chat", complexity: "standard" }),
		};

		const manager = createDialogStateManager({
			store,
			handlers,
			completions,
			classifier,
			scheduler,
			notifier,
			now: opts?.nowFn,
		});

		const gateStep = createDialogStateGateStep({ manager });
		const updateStatusSpy = vi.fn();

		const steps = createStubSteps({
			dialogStateGate: gateStep,
			updateProcessingStatus: async () => {
				updateStatusSpy();
			},
		});

		const pipeline = createPipeline(steps);

		return { pipeline, manager, store, completions, classifier, updateStatusSpy, scheduler };
	}

	describe("no active state — idle passthrough", () => {
		it("message from known user with no dialog state falls through to idle stub path", async () => {
			await seedUser("tg-pipe-idle-1");

			const { pipeline } = buildPipeline();
			const result = await pipeline(makeInput("Hello there", "tg-pipe-idle-1"));

			expect(result).toBe("I received your message. Pipeline not yet implemented.");
		});

		it("message from unknown user falls through to idle stub path", async () => {
			const { pipeline } = buildPipeline();
			const result = await pipeline(makeInput("Hello", "tg-pipe-unknown-user"));

			expect(result).toBe("I received your message. Pipeline not yet implemented.");
		});
	});

	describe("active state — reply_and_stop", () => {
		it("seeded conflict state is completed through real gate+manager+store composition", async () => {
			const userId = await seedUser("tg-pipe-conflict-1");
			const store = createDialogStateStore(db);
			const now = new Date();

			await store.upsertByExternalUserId({
				externalUserId: "tg-pipe-conflict-1",
				state: "confirm",
				context: {
					type: "conflict",
					existingFactId: "f-1",
					existingFactSummary: "Likes tea",
					pendingFactSummary: "Likes coffee",
					resumePayload: {},
				},
				now,
				expiresAt: new Date(now.getTime() + THIRTY_MINUTES_MS),
			});

			const conflictCallback = vi.fn().mockResolvedValue({ response: "Updated to coffee." });
			const { pipeline, updateStatusSpy } = buildPipeline({
				completionOverrides: { conflict: conflictCallback },
			});

			const result = await pipeline(makeInput("yes", "tg-pipe-conflict-1"));

			expect(result).toBe("Updated to coffee.");
			expect(conflictCallback).toHaveBeenCalledTimes(1);
			expect(updateStatusSpy).toHaveBeenCalledTimes(1);

			const afterLookup = await store.getByExternalUserId("tg-pipe-conflict-1");
			expect(afterLookup.dialogState).toBeNull();
		});

		it("seeded entity_disambiguation state is completed via label match", async () => {
			await seedUser("tg-pipe-ed-1");
			const seedStore = createDialogStateStore(db);
			const now = new Date();

			await seedStore.upsertByExternalUserId({
				externalUserId: "tg-pipe-ed-1",
				state: "await",
				context: {
					type: "entity_disambiguation",
					mention: "Alex",
					candidateEntityIds: ["e-1", "e-2"],
					candidateOptions: [
						{ entityId: "e-1", label: "Alex Smith" },
						{ entityId: "e-2", label: "Alex Jones" },
					],
					pendingFact: { content: "Alex likes hiking" },
				},
				now,
				expiresAt: new Date(now.getTime() + THIRTY_MINUTES_MS),
			});

			const edCallback = vi.fn().mockResolvedValue({ response: "Saved for Alex Smith." });
			const { pipeline } = buildPipeline({
				completionOverrides: { entity_disambiguation: edCallback },
			});

			const result = await pipeline(makeInput("Alex Smith", "tg-pipe-ed-1"));

			expect(result).toBe("Saved for Alex Smith.");
			expect(edCallback).toHaveBeenCalledTimes(1);
		});
	});

	describe("off-topic reset — continue through idle path", () => {
		it("off-topic message resets active state and reaches the idle stub path", async () => {
			await seedUser("tg-pipe-offtopic-1");
			const seedStore = createDialogStateStore(db);
			const now = new Date();

			await seedStore.upsertByExternalUserId({
				externalUserId: "tg-pipe-offtopic-1",
				state: "await",
				context: {
					type: "entity_disambiguation",
					mention: "Alex",
					candidateEntityIds: ["e-1"],
					candidateOptions: [{ entityId: "e-1", label: "Alex Smith" }],
					pendingFact: { content: "Alex likes hiking" },
				},
				now,
				expiresAt: new Date(now.getTime() + THIRTY_MINUTES_MS),
			});

			const edCallback = vi.fn();
			const { pipeline } = buildPipeline({
				completionOverrides: { entity_disambiguation: edCallback },
			});

			const result = await pipeline(
				makeInput("What is the weather in Berlin?", "tg-pipe-offtopic-1"),
			);

			expect(result).toBe("I received your message. Pipeline not yet implemented.");
			expect(edCallback).not.toHaveBeenCalled();

			const afterLookup = await seedStore.getByExternalUserId("tg-pipe-offtopic-1");
			expect(afterLookup.dialogState).toBeNull();
		});
	});

	describe("expired state — inbound reconciliation", () => {
		it("expired state is reset during inbound processing and message reaches idle path", async () => {
			await seedUser("tg-pipe-expired-1");
			const seedStore = createDialogStateStore(db);
			const pastCreated = new Date(Date.now() - THIRTY_MINUTES_MS - 60_000);
			const pastExpires = new Date(pastCreated.getTime() + THIRTY_MINUTES_MS);

			await seedStore.upsertByExternalUserId({
				externalUserId: "tg-pipe-expired-1",
				state: "confirm",
				context: {
					type: "conflict",
					existingFactId: "f-old",
					existingFactSummary: "Old fact",
					pendingFactSummary: "New fact",
					resumePayload: {},
				},
				now: pastCreated,
				expiresAt: pastExpires,
			});

			const conflictCallback = vi.fn();
			const { pipeline } = buildPipeline({
				completionOverrides: { conflict: conflictCallback },
			});

			const result = await pipeline(makeInput("yes", "tg-pipe-expired-1"));

			expect(result).toBe("I received your message. Pipeline not yet implemented.");
			expect(conflictCallback).not.toHaveBeenCalled();

			const afterLookup = await seedStore.getByExternalUserId("tg-pipe-expired-1");
			expect(afterLookup.dialogState).toBeNull();
		});
	});

	describe("malformed state — fail-closed reset", () => {
		it("malformed context is reset without calling any completion callback", async () => {
			const userId = await seedUser("tg-pipe-malformed-1");
			const now = new Date();

			await db
				.insert(dialogStates)
				.values({
					userId,
					state: "confirm",
					context: { garbage: true },
					createdAt: now,
					expiresAt: new Date(now.getTime() + THIRTY_MINUTES_MS),
				})
				.onConflictDoUpdate({
					target: dialogStates.userId,
					set: {
						state: "confirm",
						context: { garbage: true },
						createdAt: now,
						expiresAt: new Date(now.getTime() + THIRTY_MINUTES_MS),
					},
				});

			const conflictCallback = vi.fn();
			const { pipeline } = buildPipeline({
				completionOverrides: { conflict: conflictCallback },
			});

			const result = await pipeline(makeInput("yes", "tg-pipe-malformed-1"));

			expect(result).toBe("I received your message. Pipeline not yet implemented.");
			expect(conflictCallback).not.toHaveBeenCalled();

			const seedStore = createDialogStateStore(db);
			const afterLookup = await seedStore.getByExternalUserId("tg-pipe-malformed-1");
			expect(afterLookup.dialogState).toBeNull();
		});
	});

	describe("updateProcessingStatus preservation", () => {
		it("updateProcessingStatus runs on active-state early exit", async () => {
			await seedUser("tg-pipe-status-1");
			const seedStore = createDialogStateStore(db);
			const now = new Date();

			await seedStore.upsertByExternalUserId({
				externalUserId: "tg-pipe-status-1",
				state: "confirm",
				context: { type: "account_delete" },
				now,
				expiresAt: new Date(now.getTime() + THIRTY_MINUTES_MS),
			});

			const { pipeline, updateStatusSpy } = buildPipeline();

			await pipeline(makeInput("yes", "tg-pipe-status-1"));

			expect(updateStatusSpy).toHaveBeenCalledTimes(1);
		});

		it("updateProcessingStatus runs when the gate throws", async () => {
			await seedUser("tg-pipe-throw-1");
			const seedStore = createDialogStateStore(db);
			const now = new Date();

			await seedStore.upsertByExternalUserId({
				externalUserId: "tg-pipe-throw-1",
				state: "confirm",
				context: {
					type: "conflict",
					existingFactId: "f-1",
					existingFactSummary: "A",
					pendingFactSummary: "B",
					resumePayload: {},
				},
				now,
				expiresAt: new Date(now.getTime() + THIRTY_MINUTES_MS),
			});

			const failingCallback = vi.fn().mockRejectedValue(new Error("DB write failed"));
			const updateStatusSpy = vi.fn();

			const store = createDialogStateStore(db);
			const handlers = createDialogStateHandlers();
			const scheduler = createDialogStateTimeoutScheduler();
			const completions: DialogStateCompletionCallbacks = {
				conflict: failingCallback,
				delete: vi.fn().mockResolvedValue({ response: "" }),
				account_delete: vi.fn().mockResolvedValue({ response: "" }),
				interest: vi.fn().mockResolvedValue({ response: "" }),
				missing_data: vi.fn().mockResolvedValue({ response: "" }),
				entity_disambiguation: vi.fn().mockResolvedValue({ response: "" }),
			};
			const classifier = {
				classify: vi.fn().mockResolvedValue({ intent: "chat", complexity: "standard" }),
			};
			const notifier = { sendTimeoutReset: vi.fn().mockResolvedValue(undefined) };

			const manager = createDialogStateManager({
				store,
				handlers,
				completions,
				classifier,
				scheduler,
				notifier,
			});
			const gateStep = createDialogStateGateStep({ manager });

			const steps = createStubSteps({
				dialogStateGate: gateStep,
				updateProcessingStatus: async () => {
					updateStatusSpy();
				},
			});
			const pipeline = createPipeline(steps);

			const result = await pipeline(makeInput("yes", "tg-pipe-throw-1"));

			expect(result).toBe(FALLBACK_RESPONSE);
			expect(updateStatusSpy).toHaveBeenCalledTimes(1);
		});
	});
});

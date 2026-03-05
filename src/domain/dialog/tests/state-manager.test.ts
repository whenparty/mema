import type { Intent } from "@/shared/types";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
	type DialogStateManager,
	DIALOG_TIMEOUT_MS,
	RECENT_RESET_TTL_MS,
	createDialogStateManager,
} from "../state-manager";
import type {
	ConflictContext,
	DialogContext,
	DialogStateRecord,
	DialogStateStore,
	MissingDataContext,
} from "../types";

// --- Fixtures ---

const USER_ID = "user-123";
const NOW = 1700000000000;

const CONFLICT_CONTEXT: ConflictContext = {
	type: "conflict",
	factId: "fact-1",
	existingContent: "old value",
	newContent: "new value",
};

const MISSING_DATA_CONTEXT: MissingDataContext = {
	type: "missing_data",
	intent: "reminder.create",
	missingFields: ["date"],
	partialData: { title: "dentist" },
};

function makeRecord(
	overrides: Partial<DialogStateRecord> = {},
): DialogStateRecord {
	return {
		userId: USER_ID,
		state: "confirm",
		context: CONFLICT_CONTEXT,
		createdAt: new Date(NOW - 60_000),
		expiresAt: new Date(NOW + DIALOG_TIMEOUT_MS),
		...overrides,
	};
}

function createMockStore(): DialogStateStore & {
	_loadResult: DialogStateRecord | null;
} {
	const store = {
		_loadResult: null as DialogStateRecord | null,
		load: vi.fn(async () => store._loadResult),
		upsert: vi.fn(async () => {}),
		resetToIdle: vi.fn(async () => {}),
	};
	return store;
}

// --- Tests ---

describe("createDialogStateManager", () => {
	let store: ReturnType<typeof createMockStore>;
	let manager: DialogStateManager;

	beforeEach(() => {
		store = createMockStore();
		manager = createDialogStateManager({ store });
	});

	afterEach(() => {
		vi.restoreAllMocks();
	});

	// --- AC3: Idle state behavior ---

	describe("idle state / no record", () => {
		it("returns idle_noop when no record exists", async () => {
			store._loadResult = null;

			const decision = await manager.evaluateInbound(USER_ID, "chat", "hello", NOW);

			expect(decision.kind).toBe("idle_noop");
		});

		it("returns idle_noop when record state is idle", async () => {
			store._loadResult = makeRecord({ state: "idle", context: null, expiresAt: null });

			const decision = await manager.evaluateInbound(USER_ID, "chat", "hello", NOW);

			expect(decision.kind).toBe("idle_noop");
		});

		it("returns idle_noop for non-bare-confirmation in idle", async () => {
			store._loadResult = null;

			const decision = await manager.evaluateInbound(
				USER_ID,
				"memory.save",
				"Remember my birthday is March 15",
				NOW,
			);

			expect(decision.kind).toBe("idle_noop");
		});
	});

	// --- EC1: Malformed persisted context ---

	describe("malformed persisted context", () => {
		it("resets to idle when non-idle state has null context", async () => {
			store._loadResult = makeRecord({ state: "confirm", context: null });

			const decision = await manager.evaluateInbound(USER_ID, "chat", "hello", NOW);

			expect(decision.kind).toBe("idle_noop");
			expect(store.resetToIdle).toHaveBeenCalledWith(USER_ID);
		});

		it("resets to idle when state/context family is mismatched", async () => {
			store._loadResult = makeRecord({
				state: "confirm",
				context: MISSING_DATA_CONTEXT,
			});

			const decision = await manager.evaluateInbound(USER_ID, "chat", "hello", NOW);

			expect(decision.kind).toBe("idle_noop");
			expect(store.resetToIdle).toHaveBeenCalledWith(USER_ID);
		});

		it("resets to idle when await state has confirm context", async () => {
			store._loadResult = makeRecord({
				state: "await",
				context: CONFLICT_CONTEXT,
			});

			const decision = await manager.evaluateInbound(USER_ID, "chat", "hello", NOW);

			expect(decision.kind).toBe("idle_noop");
			expect(store.resetToIdle).toHaveBeenCalledWith(USER_ID);
		});
	});

	// --- AC3: continue_dialog ---

	describe("continue_dialog", () => {
		it("returns continue_dialog for chat intent in non-idle state", async () => {
			store._loadResult = makeRecord();

			const decision = await manager.evaluateInbound(USER_ID, "chat", "sure", NOW);

			expect(decision.kind).toBe("continue_dialog");
			if (decision.kind === "continue_dialog") {
				expect(decision.state).toBe("confirm");
				expect(decision.context).toEqual(CONFLICT_CONTEXT);
			}
		});

		it("returns continue_dialog for await state with valid context", async () => {
			store._loadResult = makeRecord({
				state: "await",
				context: MISSING_DATA_CONTEXT,
			});

			const decision = await manager.evaluateInbound(USER_ID, "chat", "March 15", NOW);

			expect(decision.kind).toBe("continue_dialog");
			if (decision.kind === "continue_dialog") {
				expect(decision.state).toBe("await");
				expect(decision.context).toEqual(MISSING_DATA_CONTEXT);
			}
		});
	});

	// --- AC4: Timeout reset ---

	describe("timeout reset", () => {
		it("resets when expires_at is in the past", async () => {
			store._loadResult = makeRecord({
				expiresAt: new Date(NOW - 1000),
			});

			const decision = await manager.evaluateInbound(USER_ID, "chat", "hello", NOW);

			expect(decision.kind).toBe("reset_timeout");
			if (decision.kind === "reset_timeout") {
				expect(decision.previousState).toBe("confirm");
				expect(decision.previousContextType).toBe("conflict");
			}
			expect(store.resetToIdle).toHaveBeenCalledWith(USER_ID);
		});

		it("treats message at exact expires_at as expired (boundary)", async () => {
			store._loadResult = makeRecord({
				expiresAt: new Date(NOW),
			});

			const decision = await manager.evaluateInbound(USER_ID, "chat", "hello", NOW);

			expect(decision.kind).toBe("reset_timeout");
			expect(store.resetToIdle).toHaveBeenCalledWith(USER_ID);
		});

		it("does not timeout when message arrives before expires_at", async () => {
			store._loadResult = makeRecord({
				expiresAt: new Date(NOW + 1),
			});

			const decision = await manager.evaluateInbound(USER_ID, "chat", "hello", NOW);

			expect(decision.kind).toBe("continue_dialog");
		});

		it("does not timeout when expiresAt is null", async () => {
			store._loadResult = makeRecord({
				expiresAt: null,
			});

			const decision = await manager.evaluateInbound(USER_ID, "chat", "hello", NOW);

			expect(decision.kind).toBe("continue_dialog");
		});

		it("timeout takes precedence over off-topic", async () => {
			store._loadResult = makeRecord({
				expiresAt: new Date(NOW - 1),
			});

			const decision = await manager.evaluateInbound(USER_ID, "memory.save", "save this", NOW);

			expect(decision.kind).toBe("reset_timeout");
		});
	});

	// --- AC5: Off-topic reset ---

	describe("off-topic reset", () => {
		it("resets on memory.save intent in non-idle state", async () => {
			store._loadResult = makeRecord();

			const decision = await manager.evaluateInbound(
				USER_ID,
				"memory.save",
				"Remember my cat's name is Luna",
				NOW,
			);

			expect(decision.kind).toBe("reset_off_topic");
			if (decision.kind === "reset_off_topic") {
				expect(decision.previousState).toBe("confirm");
				expect(decision.previousContextType).toBe("conflict");
			}
			expect(store.resetToIdle).toHaveBeenCalledWith(USER_ID);
		});

		it("resets on reminder.create intent in non-idle state", async () => {
			store._loadResult = makeRecord();

			const decision = await manager.evaluateInbound(
				USER_ID,
				"reminder.create",
				"Remind me at 5pm",
				NOW,
			);

			expect(decision.kind).toBe("reset_off_topic");
		});

		it("resets on system.delete_account intent in non-idle state", async () => {
			store._loadResult = makeRecord();

			const decision = await manager.evaluateInbound(
				USER_ID,
				"system.delete_account",
				"Delete my account",
				NOW,
			);

			expect(decision.kind).toBe("reset_off_topic");
		});

		it("chat intent is NOT off-topic in non-idle state", async () => {
			store._loadResult = makeRecord();

			const decision = await manager.evaluateInbound(USER_ID, "chat", "tell me more", NOW);

			expect(decision.kind).toBe("continue_dialog");
		});

		it("undefined intent (classifier failure) is NOT off-topic", async () => {
			store._loadResult = makeRecord();

			const decision = await manager.evaluateInbound(USER_ID, undefined, "asdfgh", NOW);

			expect(decision.kind).toBe("continue_dialog");
		});

		const offTopicIntents: Intent[] = [
			"memory.save", "memory.view", "memory.edit",
			"memory.delete", "memory.delete_entity", "memory.explain",
			"reminder.create", "reminder.list", "reminder.cancel", "reminder.edit",
			"system.delete_account", "system.pause", "system.resume",
		];

		for (const intent of offTopicIntents) {
			it(`resets on ${intent} intent`, async () => {
				store._loadResult = makeRecord();

				const decision = await manager.evaluateInbound(USER_ID, intent, "some text", NOW);

				expect(decision.kind).toBe("reset_off_topic");
			});
		}
	});

	// --- AC6: Bare confirmation recovery ---

	describe("bare confirmation recovery", () => {
		it("recovers after timeout reset within TTL", async () => {
			store._loadResult = makeRecord({ expiresAt: new Date(NOW - 1000) });
			await manager.evaluateInbound(USER_ID, "chat", "hello", NOW);
			expect(store.resetToIdle).toHaveBeenCalled();

			store._loadResult = null;
			const decision = await manager.evaluateInbound(USER_ID, undefined, "yes", NOW + 1000);

			expect(decision.kind).toBe("recover_recent_reset");
			if (decision.kind === "recover_recent_reset") {
				expect(decision.resetContext).toEqual(CONFLICT_CONTEXT);
				expect(decision.resetReason).toBe("timeout");
			}
		});

		it("recovers after off-topic reset within TTL", async () => {
			store._loadResult = makeRecord();
			await manager.evaluateInbound(USER_ID, "memory.save", "save this", NOW);

			store._loadResult = null;
			const decision = await manager.evaluateInbound(USER_ID, undefined, "no", NOW + 1000);

			expect(decision.kind).toBe("recover_recent_reset");
			if (decision.kind === "recover_recent_reset") {
				expect(decision.resetContext).toEqual(CONFLICT_CONTEXT);
				expect(decision.resetReason).toBe("off_topic");
			}
		});

		it("does not recover after TTL expires", async () => {
			store._loadResult = makeRecord({ expiresAt: new Date(NOW - 1000) });
			await manager.evaluateInbound(USER_ID, "chat", "hello", NOW);

			store._loadResult = null;
			const decision = await manager.evaluateInbound(
				USER_ID,
				undefined,
				"yes",
				NOW + RECENT_RESET_TTL_MS + 1,
			);

			expect(decision.kind).toBe("idle_noop");
		});

		it("one-shot consumption: second bare confirmation returns idle_noop", async () => {
			store._loadResult = makeRecord({ expiresAt: new Date(NOW - 1000) });
			await manager.evaluateInbound(USER_ID, "chat", "hello", NOW);

			store._loadResult = null;
			const first = await manager.evaluateInbound(USER_ID, undefined, "yes", NOW + 1000);
			expect(first.kind).toBe("recover_recent_reset");

			const second = await manager.evaluateInbound(USER_ID, undefined, "yes", NOW + 2000);
			expect(second.kind).toBe("idle_noop");
		});

		it("non-bare-confirmation text in idle does not trigger recovery", async () => {
			store._loadResult = makeRecord({ expiresAt: new Date(NOW - 1000) });
			await manager.evaluateInbound(USER_ID, "chat", "hello", NOW);

			store._loadResult = null;
			const decision = await manager.evaluateInbound(
				USER_ID,
				undefined,
				"I went to the store today",
				NOW + 1000,
			);

			expect(decision.kind).toBe("idle_noop");
		});

		it("recovery works with different bare confirmation words", async () => {
			store._loadResult = makeRecord({ expiresAt: new Date(NOW - 1000) });
			await manager.evaluateInbound(USER_ID, "chat", "hello", NOW);

			store._loadResult = null;

			for (const word of ["ok", "sure", "cancel", "confirm", "nah"]) {
				manager = createDialogStateManager({ store });

				store._loadResult = makeRecord({ expiresAt: new Date(NOW - 1000) });
				await manager.evaluateInbound(USER_ID, "chat", "hello", NOW);

				store._loadResult = null;
				const decision = await manager.evaluateInbound(USER_ID, undefined, word, NOW + 1000);
				expect(decision.kind).toBe("recover_recent_reset");
			}
		});
	});

	// --- transitionTo ---

	describe("transitionTo", () => {
		it("calls store.upsert with correct arguments", async () => {
			await manager.transitionTo(USER_ID, "confirm", CONFLICT_CONTEXT);

			expect(store.upsert).toHaveBeenCalledOnce();
			const [userId, state, context, expiresAt] = store.upsert.mock.calls[0];
			expect(userId).toBe(USER_ID);
			expect(state).toBe("confirm");
			expect(context).toEqual(CONFLICT_CONTEXT);
			expect(expiresAt).toBeInstanceOf(Date);
		});

		it("uses default timeout of 30 minutes", async () => {
			const before = Date.now();
			await manager.transitionTo(USER_ID, "confirm", CONFLICT_CONTEXT);
			const after = Date.now();

			const expiresAt = store.upsert.mock.calls[0][3] as Date;
			expect(expiresAt.getTime()).toBeGreaterThanOrEqual(before + DIALOG_TIMEOUT_MS);
			expect(expiresAt.getTime()).toBeLessThanOrEqual(after + DIALOG_TIMEOUT_MS);
		});

		it("accepts custom timeout", async () => {
			const customTimeout = 60_000;
			const before = Date.now();
			await manager.transitionTo(USER_ID, "await", MISSING_DATA_CONTEXT, customTimeout);
			const after = Date.now();

			const expiresAt = store.upsert.mock.calls[0][3] as Date;
			expect(expiresAt.getTime()).toBeGreaterThanOrEqual(before + customTimeout);
			expect(expiresAt.getTime()).toBeLessThanOrEqual(after + customTimeout);
		});
	});

	// --- resetToIdle ---

	describe("resetToIdle", () => {
		it("calls store.resetToIdle", async () => {
			store._loadResult = makeRecord();

			await manager.resetToIdle(USER_ID, "completed");

			expect(store.resetToIdle).toHaveBeenCalledWith(USER_ID);
		});

		it("caches reset context for bare confirmation recovery", async () => {
			store._loadResult = makeRecord();
			await manager.resetToIdle(USER_ID, "completed");

			store._loadResult = null;
			const decision = await manager.evaluateInbound(USER_ID, undefined, "yes", Date.now());

			expect(decision.kind).toBe("recover_recent_reset");
			if (decision.kind === "recover_recent_reset") {
				expect(decision.resetContext).toEqual(CONFLICT_CONTEXT);
				expect(decision.resetReason).toBe("completed");
			}
		});

		it("does not crash when record has no context", async () => {
			store._loadResult = makeRecord({ context: null });

			await manager.resetToIdle(USER_ID, "completed");

			expect(store.resetToIdle).toHaveBeenCalledWith(USER_ID);
		});

		it("does not crash when no record exists", async () => {
			store._loadResult = null;

			await manager.resetToIdle(USER_ID, "completed");

			expect(store.resetToIdle).toHaveBeenCalledWith(USER_ID);
		});
	});

	// --- EC3: Reset when already idle ---

	describe("edge: reset invoked when already idle", () => {
		it("handles resetToIdle when already idle without crash", async () => {
			store._loadResult = makeRecord({ state: "idle", context: null, expiresAt: null });

			await manager.resetToIdle(USER_ID, "completed");

			expect(store.resetToIdle).toHaveBeenCalledWith(USER_ID);
		});
	});

	// --- Multi-user isolation ---

	describe("multi-user isolation", () => {
		it("bare confirmation cache is per-user", async () => {
			const userA = "user-A";
			const userB = "user-B";

			store._loadResult = makeRecord({ userId: userA, expiresAt: new Date(NOW - 1000) });
			await manager.evaluateInbound(userA, "chat", "hello", NOW);

			store._loadResult = null;
			const decisionB = await manager.evaluateInbound(userB, undefined, "yes", NOW + 1000);
			expect(decisionB.kind).toBe("idle_noop");

			const decisionA = await manager.evaluateInbound(userA, undefined, "yes", NOW + 1000);
			expect(decisionA.kind).toBe("recover_recent_reset");
		});
	});

	// --- Store is called with userId ---

	describe("store calls use userId", () => {
		it("passes userId to store.load", async () => {
			store._loadResult = null;
			await manager.evaluateInbound(USER_ID, "chat", "hello", NOW);

			expect(store.load).toHaveBeenCalledWith(USER_ID);
		});
	});
});

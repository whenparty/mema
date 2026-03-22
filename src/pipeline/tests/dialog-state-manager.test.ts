import type { MessageInput } from "@/shared/types";
import { describe, expect, it, vi } from "vitest";
import { createDialogStateHandlers } from "../dialog-state-handlers";
import { createDialogStateManager } from "../dialog-state-manager";
import type {
	ActiveDialogState,
	CompareAndResetDialogStateParams,
	ConflictDialogStateContext,
	DialogStateCompletionCallbacks,
	DialogStateContext,
	DialogStateGateDecision,
	DialogStateHandlerRegistry,
	DialogStateManager,
	DialogStateManagerDeps,
	DialogStateStorePort,
	DialogStateTimeoutScheduler,
	EntityDisambiguationDialogStateContext,
	MissingDataDialogStateContext,
	RecentResetHint,
	ScheduledDialogStateRef,
	StoredDialogStateRecord,
} from "../dialog-state-types";
import type { PipelineContext } from "../types";

const mockLog = {
	debug: vi.fn(),
	info: vi.fn(),
	warn: vi.fn(),
	error: vi.fn(),
	child: vi.fn(),
} as never;

const FIXED_NOW = new Date("2026-03-22T12:00:00Z");
const THIRTY_MINUTES_MS = 30 * 60 * 1000;

function makePipelineContext(overrides?: Partial<PipelineContext>): PipelineContext {
	const input: MessageInput = {
		text: "yes",
		externalUserId: "tg-user-1",
		username: "testuser",
		firstName: "Test",
		languageCode: "en",
		platformUpdateId: 1,
	};
	return { input, stepTimings: {}, ...overrides };
}

function makeConflictContext(): ConflictDialogStateContext {
	return {
		type: "conflict",
		existingFactId: "fact-1",
		existingFactSummary: "Likes tea",
		pendingFactSummary: "Likes coffee",
		resumePayload: {},
	};
}

function makeEntityDisambiguationContext(): EntityDisambiguationDialogStateContext {
	return {
		type: "entity_disambiguation",
		mention: "Alex",
		candidateEntityIds: ["e-1", "e-2"],
		candidateOptions: [
			{ entityId: "e-1", label: "Alex Smith" },
			{ entityId: "e-2", label: "Alex Jones" },
		],
		pendingFact: { content: "Alex likes hiking" },
	};
}

function makeMissingDataContext(): MissingDataDialogStateContext {
	return {
		type: "missing_data",
		originalIntent: "reminder.create",
		missingField: "city",
		resumePayload: { reminderText: "dentist appointment" },
	};
}

function makeStoredRecord(
	context: DialogStateContext,
	state: "confirm" | "await" = "confirm",
): StoredDialogStateRecord {
	return {
		userId: "internal-user-1",
		state,
		context: context as unknown,
		createdAt: new Date(FIXED_NOW.getTime() - 5 * 60 * 1000),
		expiresAt: new Date(FIXED_NOW.getTime() + 25 * 60 * 1000),
	};
}

function createFakeStore(options?: {
	record?: StoredDialogStateRecord | null;
	userId?: string | null;
	resetStatus?: "reset" | "stale" | "already_idle" | "not_found";
}): DialogStateStorePort {
	const record = options?.record ?? null;
	const userId = options?.userId ?? (record ? record.userId : null);
	const resetStatus = options?.resetStatus ?? "reset";

	return {
		getByExternalUserId: vi.fn().mockResolvedValue({
			userId,
			dialogState: record,
		}),
		upsertByExternalUserId: vi.fn().mockResolvedValue(record),
		resetByExternalUserId: vi.fn().mockResolvedValue({
			status: resetStatus,
			userId,
			previousState: record,
		}),
		compareAndResetByUserId: vi.fn().mockResolvedValue({
			status: resetStatus,
			userId,
			previousState: record,
		}),
	};
}

function createFakeScheduler(): DialogStateTimeoutScheduler {
	return {
		schedule: vi.fn(),
		cancel: vi.fn(),
	};
}

function createFakeCompletions(): DialogStateCompletionCallbacks {
	return {
		conflict: vi.fn().mockResolvedValue({ response: "Conflict resolved." }),
		delete: vi.fn().mockResolvedValue({ response: "Deleted." }),
		account_delete: vi.fn().mockResolvedValue({ response: "Account deleted." }),
		interest: vi.fn().mockResolvedValue({ response: "Interest saved." }),
		missing_data: vi.fn().mockResolvedValue({ response: "Got it, creating reminder." }),
		entity_disambiguation: vi.fn().mockResolvedValue({ response: "Saved with the right entity." }),
	};
}

function createFakeClassifier(intent = "chat" as string) {
	return {
		classify: vi.fn().mockResolvedValue({ intent, complexity: "standard" }),
	};
}

function createFakeNotifier() {
	return {
		sendTimeoutReset: vi.fn().mockResolvedValue(undefined),
	};
}

function buildManagerDeps(overrides?: Partial<DialogStateManagerDeps>): DialogStateManagerDeps {
	return {
		store: createFakeStore(),
		handlers: createDialogStateHandlers(),
		completions: createFakeCompletions(),
		classifier: createFakeClassifier(),
		scheduler: createFakeScheduler(),
		notifier: createFakeNotifier(),
		now: () => FIXED_NOW,
		...overrides,
	};
}

describe("createDialogStateHandlers", () => {
	it("returns a registry with all six subtype keys", () => {
		const registry = createDialogStateHandlers();

		const requiredKeys: (keyof DialogStateHandlerRegistry)[] = [
			"conflict",
			"delete",
			"account_delete",
			"interest",
			"missing_data",
			"entity_disambiguation",
		];

		for (const key of requiredKeys) {
			expect(registry).toHaveProperty(key);
			expect(registry[key].subtype).toBe(key);
		}
	});

	it("enforces confirm subtypes map to expectedState confirm", () => {
		const registry = createDialogStateHandlers();

		expect(registry.conflict.expectedState).toBe("confirm");
		expect(registry.delete.expectedState).toBe("confirm");
		expect(registry.account_delete.expectedState).toBe("confirm");
		expect(registry.interest.expectedState).toBe("confirm");
	});

	it("enforces await subtypes map to expectedState await", () => {
		const registry = createDialogStateHandlers();

		expect(registry.missing_data.expectedState).toBe("await");
		expect(registry.entity_disambiguation.expectedState).toBe("await");
	});
});

describe("handler parseContext validation", () => {
	it("conflict handler rejects context missing required keys", () => {
		const registry = createDialogStateHandlers();
		const result = registry.conflict.parseContext({ type: "conflict" });

		expect(result).toBeNull();
	});

	it("conflict handler accepts valid minimum payload", () => {
		const registry = createDialogStateHandlers();
		const result = registry.conflict.parseContext(makeConflictContext());

		expect(result).not.toBeNull();
		expect(result?.type).toBe("conflict");
	});

	it("delete handler rejects fact-delete context without factIds", () => {
		const registry = createDialogStateHandlers();
		const result = registry.delete.parseContext({
			type: "delete",
			deleteMode: "fact",
			targetLabel: "some fact",
			resumePayload: {},
		});

		expect(result).toBeNull();
	});

	it("delete handler rejects entity-delete context without entityId", () => {
		const registry = createDialogStateHandlers();
		const result = registry.delete.parseContext({
			type: "delete",
			deleteMode: "entity",
			targetLabel: "Alex",
			resumePayload: {},
		});

		expect(result).toBeNull();
	});

	it("entity_disambiguation handler rejects mismatched candidateEntityIds and candidateOptions", () => {
		const registry = createDialogStateHandlers();
		const result = registry.entity_disambiguation.parseContext({
			type: "entity_disambiguation",
			mention: "Alex",
			candidateEntityIds: ["e-1", "e-2"],
			candidateOptions: [{ entityId: "e-1", label: "Alex Smith" }],
			pendingFact: {},
		});

		expect(result).toBeNull();
	});

	it("entity_disambiguation handler accepts matching candidateEntityIds and candidateOptions", () => {
		const registry = createDialogStateHandlers();
		const result = registry.entity_disambiguation.parseContext(makeEntityDisambiguationContext());

		expect(result).not.toBeNull();
		expect(result?.type).toBe("entity_disambiguation");
	});
});

describe("createDialogStateManager", () => {
	describe("evaluateInbound — CONFIRM continuation", () => {
		it("conflict: matched reply completes state through callback and returns reply_and_stop", async () => {
			const conflictRecord = makeStoredRecord(makeConflictContext(), "confirm");
			const store = createFakeStore({ record: conflictRecord });
			const completions = createFakeCompletions();
			const scheduler = createFakeScheduler();
			const deps = buildManagerDeps({ store, completions, scheduler });
			const manager = createDialogStateManager(deps);

			const ctx = makePipelineContext({
				input: { ...makePipelineContext().input, text: "yes, update it" },
			});
			const decision = await manager.evaluateInbound(ctx, mockLog);

			expect(decision.action).toBe("reply_and_stop");
			expect(completions.conflict).toHaveBeenCalled();
			expect(store.compareAndResetByUserId).toHaveBeenCalled();
			if (decision.action === "reply_and_stop") {
				expect(decision.response).toEqual(expect.any(String));
			}
		});
	});

	describe("evaluateInbound — AWAIT continuation", () => {
		it("entity_disambiguation: matched reply completes state through callback", async () => {
			const edRecord = makeStoredRecord(makeEntityDisambiguationContext(), "await");
			const store = createFakeStore({ record: edRecord });
			const completions = createFakeCompletions();
			const deps = buildManagerDeps({ store, completions });
			const manager = createDialogStateManager(deps);

			const ctx = makePipelineContext({
				input: { ...makePipelineContext().input, text: "Alex Smith" },
			});
			const decision = await manager.evaluateInbound(ctx, mockLog);

			expect(decision.action).toBe("reply_and_stop");
			expect(completions.entity_disambiguation).toHaveBeenCalled();
		});
	});

	describe("evaluateInbound — off-topic reset", () => {
		it("entity_disambiguation off-topic resets state and never invokes callback", async () => {
			const edRecord = makeStoredRecord(makeEntityDisambiguationContext(), "await");
			const store = createFakeStore({ record: edRecord });
			const completions = createFakeCompletions();
			const classifier = createFakeClassifier("memory.save");
			const deps = buildManagerDeps({ store, completions, classifier });
			const manager = createDialogStateManager(deps);

			const ctx = makePipelineContext({
				input: {
					...makePipelineContext().input,
					text: "Remember I have a dentist appointment tomorrow",
				},
			});
			const decision = await manager.evaluateInbound(ctx, mockLog);

			expect(decision.action).toBe("continue_pipeline");
			expect(completions.entity_disambiguation).not.toHaveBeenCalled();
		});
	});

	describe("evaluateInbound — malformed payload", () => {
		it("malformed context fails closed with reset and no callback invocation", async () => {
			const malformedRecord: StoredDialogStateRecord = {
				userId: "internal-user-1",
				state: "confirm",
				context: { type: "conflict" },
				createdAt: new Date(FIXED_NOW.getTime() - 5 * 60 * 1000),
				expiresAt: new Date(FIXED_NOW.getTime() + 25 * 60 * 1000),
			};
			const store = createFakeStore({ record: malformedRecord });
			const completions = createFakeCompletions();
			const deps = buildManagerDeps({ store, completions });
			const manager = createDialogStateManager(deps);

			const ctx = makePipelineContext();
			const decision = await manager.evaluateInbound(ctx, mockLog);

			expect(decision.action).toBe("continue_pipeline");
			expect(completions.conflict).not.toHaveBeenCalled();
			expect(store.compareAndResetByUserId).toHaveBeenCalled();
		});
	});

	describe("evaluateInbound — pause/resume quarantine", () => {
		it("ambiguous fallback with system.pause quarantines to cancel-and-reprocess", async () => {
			const conflictRecord = makeStoredRecord(makeConflictContext(), "confirm");
			const store = createFakeStore({ record: conflictRecord });
			const completions = createFakeCompletions();
			const classifier = createFakeClassifier("system.pause");
			const deps = buildManagerDeps({ store, completions, classifier });
			const manager = createDialogStateManager(deps);

			const ctx = makePipelineContext({ input: { ...makePipelineContext().input, text: "pause" } });
			const decision = await manager.evaluateInbound(ctx, mockLog);

			expect(decision.action).toBe("continue_pipeline");
			expect(completions.conflict).not.toHaveBeenCalled();
		});

		it("ambiguous fallback with system.resume quarantines to cancel-and-reprocess", async () => {
			const conflictRecord = makeStoredRecord(makeConflictContext(), "confirm");
			const store = createFakeStore({ record: conflictRecord });
			const completions = createFakeCompletions();
			const classifier = createFakeClassifier("system.resume");
			const deps = buildManagerDeps({ store, completions, classifier });
			const manager = createDialogStateManager(deps);

			const ctx = makePipelineContext({
				input: { ...makePipelineContext().input, text: "resume" },
			});
			const decision = await manager.evaluateInbound(ctx, mockLog);

			expect(decision.action).toBe("continue_pipeline");
			expect(completions.conflict).not.toHaveBeenCalled();
		});
	});

	describe("evaluateInbound — no active state", () => {
		it("returns continue_pipeline when no active state and no recent reset", async () => {
			const store = createFakeStore({ userId: "internal-user-1", record: null });
			const deps = buildManagerDeps({ store });
			const manager = createDialogStateManager(deps);

			const ctx = makePipelineContext();
			const decision = await manager.evaluateInbound(ctx, mockLog);

			expect(decision.action).toBe("continue_pipeline");
			expect(decision.dialogState).toBeNull();
			expect(decision.recentResetHint).toBeNull();
		});
	});

	describe("evaluateInbound — recent-reset recovery", () => {
		it("bare yes within TTL returns contextual recovery response", async () => {
			const conflictRecord = makeStoredRecord(makeConflictContext(), "confirm");
			const store = createFakeStore({ record: conflictRecord });
			const deps = buildManagerDeps({ store });
			const manager = createDialogStateManager(deps);

			const ctxFirst = makePipelineContext({
				input: { ...makePipelineContext().input, text: "what is the weather?" },
			});
			await manager.evaluateInbound(ctxFirst, mockLog);

			const ctxSecond = makePipelineContext({
				input: { ...makePipelineContext().input, text: "yes" },
			});

			const storeNoState = createFakeStore({ userId: "internal-user-1", record: null });
			(deps.store as DialogStateStorePort).getByExternalUserId = storeNoState.getByExternalUserId;

			const decision = await manager.evaluateInbound(ctxSecond, mockLog);

			expect(decision.action).toBe("reply_and_stop");
			if (decision.action === "reply_and_stop") {
				expect(decision.response).toEqual(expect.any(String));
			}
		});

		it("bare yes outside TTL falls through to continue_pipeline", async () => {
			const store = createFakeStore({ userId: "internal-user-1", record: null });
			const deps = buildManagerDeps({ store, recentResetTtlMs: 0 });
			const manager = createDialogStateManager(deps);

			const ctx = makePipelineContext({
				input: { ...makePipelineContext().input, text: "yes" },
			});
			const decision = await manager.evaluateInbound(ctx, mockLog);

			expect(decision.action).toBe("continue_pipeline");
		});
	});

	describe("evaluateInbound — callback rejection", () => {
		it("callback error keeps state active and reschedules timeout", async () => {
			const conflictRecord = makeStoredRecord(makeConflictContext(), "confirm");
			const store = createFakeStore({ record: conflictRecord });
			const completions = createFakeCompletions();
			(completions.conflict as ReturnType<typeof vi.fn>).mockRejectedValueOnce(
				new Error("DB write failed"),
			);
			const scheduler = createFakeScheduler();
			const deps = buildManagerDeps({ store, completions, scheduler });
			const manager = createDialogStateManager(deps);

			const ctx = makePipelineContext({ input: { ...makePipelineContext().input, text: "yes" } });

			await expect(manager.evaluateInbound(ctx, mockLog)).rejects.toThrow();

			expect(store.upsertByExternalUserId).toHaveBeenCalled();
		});
	});

	describe("openState", () => {
		it("validates non-idle state and schedules timeout", async () => {
			const store = createFakeStore({
				userId: "internal-user-1",
				record: makeStoredRecord(makeConflictContext(), "confirm"),
			});
			const scheduler = createFakeScheduler();
			const deps = buildManagerDeps({ store, scheduler });
			const manager = createDialogStateManager(deps);

			const result = await manager.openState({
				externalUserId: "tg-user-1",
				state: "confirm",
				context: makeConflictContext(),
				now: FIXED_NOW,
			});

			expect(result).not.toBeNull();
			expect(result?.state).toBe("confirm");
			expect(scheduler.schedule).toHaveBeenCalled();
		});

		it("returns null when user cannot be resolved", async () => {
			const store = createFakeStore({ userId: null, record: null });
			const scheduler = createFakeScheduler();
			const deps = buildManagerDeps({ store, scheduler });
			const manager = createDialogStateManager(deps);

			const result = await manager.openState({
				externalUserId: "unknown-tg-id",
				state: "confirm",
				context: makeConflictContext(),
				now: FIXED_NOW,
			});

			expect(result).toBeNull();
			expect(scheduler.schedule).not.toHaveBeenCalled();
		});
	});

	describe("evaluateInbound — manager-owned completion ordering", () => {
		it("follows matched → compareAndReset → callback → reply_and_stop ordering", async () => {
			const callOrder: string[] = [];

			const conflictRecord = makeStoredRecord(makeConflictContext(), "confirm");
			const store = createFakeStore({ record: conflictRecord });
			(store.compareAndResetByUserId as ReturnType<typeof vi.fn>).mockImplementation(async () => {
				callOrder.push("compareAndReset");
				return { status: "reset", userId: "internal-user-1", previousState: conflictRecord };
			});

			const completions = createFakeCompletions();
			(completions.conflict as ReturnType<typeof vi.fn>).mockImplementation(async () => {
				callOrder.push("callback");
				return { response: "Resolved." };
			});

			const deps = buildManagerDeps({ store, completions });
			const manager = createDialogStateManager(deps);

			const ctx = makePipelineContext({ input: { ...makePipelineContext().input, text: "yes" } });
			await manager.evaluateInbound(ctx, mockLog);

			expect(callOrder).toEqual(["compareAndReset", "callback"]);
		});
	});

	describe("evaluateInbound — user scope", () => {
		it("populates ctx.userId from resolved user", async () => {
			const store = createFakeStore({ userId: "internal-user-1", record: null });
			const deps = buildManagerDeps({ store });
			const manager = createDialogStateManager(deps);

			const ctx = makePipelineContext();
			await manager.evaluateInbound(ctx, mockLog);

			expect(ctx.userId).toBe("internal-user-1");
		});
	});
});

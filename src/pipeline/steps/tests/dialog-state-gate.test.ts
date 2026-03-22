import type { MessageInput } from "@/shared/types";
import { describe, expect, it, vi } from "vitest";
import type {
	ActiveDialogState,
	ConflictDialogStateContext,
	DialogStateGateDecision,
	DialogStateManager,
	RecentResetHint,
} from "../../dialog-state-types";
import type { PipelineContext } from "../../types";
import { createDialogStateGateStep } from "../dialog-state-gate";

const mockLog = {
	debug: vi.fn(),
	info: vi.fn(),
	warn: vi.fn(),
	error: vi.fn(),
	child: vi.fn(),
} as never;

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

function makeActiveState(): ActiveDialogState<ConflictDialogStateContext> {
	return {
		userId: "internal-user-1",
		state: "confirm",
		context: {
			type: "conflict",
			existingFactId: "fact-1",
			existingFactSummary: "Likes tea",
			pendingFactSummary: "Likes coffee",
			resumePayload: {},
		},
		createdAt: new Date("2026-03-22T12:00:00Z"),
		expiresAt: new Date("2026-03-22T12:30:00Z"),
	};
}

function makeRecentResetHint(): RecentResetHint {
	return {
		subtype: "conflict",
		reason: "timeout",
		expiresAt: new Date("2026-03-22T12:35:00Z"),
		allowedReplies: ["yes", "no", "ok"],
		timeoutMessage: "The conflict question has expired.",
		recoveryMessage: "Would you like to revisit the conflict?",
	};
}

function createFakeManager(decision: DialogStateGateDecision): DialogStateManager {
	return {
		evaluateInbound: vi.fn().mockResolvedValue(decision),
		openState: vi.fn().mockResolvedValue(null),
		handleTimeout: vi.fn().mockResolvedValue(undefined),
	};
}

describe("createDialogStateGateStep", () => {
	it("sets ctx.earlyResponse when manager returns reply_and_stop", async () => {
		const decision: DialogStateGateDecision = {
			action: "reply_and_stop",
			userId: "internal-user-1",
			dialogState: makeActiveState(),
			recentResetHint: null,
			response: "Updated the fact.",
		};
		const manager = createFakeManager(decision);
		const step = createDialogStateGateStep({ manager });

		const ctx = makePipelineContext();
		await step(ctx, mockLog);

		expect(ctx.earlyResponse).toBe("Updated the fact.");
	});

	it("does not set earlyResponse when manager returns continue_pipeline", async () => {
		const decision: DialogStateGateDecision = {
			action: "continue_pipeline",
			userId: "internal-user-1",
			dialogState: null,
			recentResetHint: null,
		};
		const manager = createFakeManager(decision);
		const step = createDialogStateGateStep({ manager });

		const ctx = makePipelineContext();
		await step(ctx, mockLog);

		expect(ctx.earlyResponse).toBeUndefined();
	});

	it("populates ctx.dialogState and ctx.recentResetHint from manager decision", async () => {
		const activeState = makeActiveState();
		const hint = makeRecentResetHint();
		const decision: DialogStateGateDecision = {
			action: "continue_pipeline",
			userId: "internal-user-1",
			dialogState: activeState,
			recentResetHint: hint,
		};
		const manager = createFakeManager(decision);
		const step = createDialogStateGateStep({ manager });

		const ctx = makePipelineContext();
		await step(ctx, mockLog);

		expect(ctx.dialogState).toBe(activeState);
		expect(ctx.recentResetHint).toBe(hint);
	});

	it("populates ctx.userId from manager decision", async () => {
		const decision: DialogStateGateDecision = {
			action: "continue_pipeline",
			userId: "internal-user-1",
			dialogState: null,
			recentResetHint: null,
		};
		const manager = createFakeManager(decision);
		const step = createDialogStateGateStep({ manager });

		const ctx = makePipelineContext();
		await step(ctx, mockLog);

		expect(ctx.userId).toBe("internal-user-1");
	});

	it("propagates manager errors to let the orchestrator handle them", async () => {
		const manager: DialogStateManager = {
			evaluateInbound: vi.fn().mockRejectedValue(new Error("store connection failed")),
			openState: vi.fn(),
			handleTimeout: vi.fn(),
		};
		const step = createDialogStateGateStep({ manager });

		const ctx = makePipelineContext();

		await expect(step(ctx, mockLog)).rejects.toThrow("store connection failed");
	});
});

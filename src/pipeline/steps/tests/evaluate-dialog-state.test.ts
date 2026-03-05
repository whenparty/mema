import type { DialogStateManager } from "@/domain/dialog/state-manager";
import type { DialogDecision } from "@/domain/dialog/types";
import type { MessageInput } from "@/shared/types";
import type pino from "pino";
import { describe, expect, it, vi } from "vitest";
import type { PipelineContext } from "../../types";
import { createEvaluateDialogStateStep } from "../evaluate-dialog-state";

const TEST_INPUT: MessageInput = {
	text: "Hello there",
	externalUserId: "user-123",
	username: "testuser",
	firstName: "Test",
	languageCode: "en",
	platformUpdateId: 42,
};

function createTestContext(overrides?: Partial<PipelineContext>): PipelineContext {
	return {
		input: TEST_INPUT,
		stepTimings: {},
		...overrides,
	};
}

const mockLog = {
	debug: vi.fn(),
	info: vi.fn(),
	warn: vi.fn(),
	error: vi.fn(),
} as unknown as pino.Logger;

function createMockManager(
	decision: DialogDecision,
): DialogStateManager {
	return {
		evaluateInbound: vi.fn().mockResolvedValue(decision),
		transitionTo: vi.fn(),
		resetToIdle: vi.fn(),
	};
}

describe("createEvaluateDialogStateStep", () => {
	describe("missing userId", () => {
		it("returns early without calling manager", async () => {
			const manager = createMockManager({ kind: "idle_noop" });
			const step = createEvaluateDialogStateStep({ dialogManager: manager });
			const ctx = createTestContext();

			await step(ctx, mockLog);

			expect(manager.evaluateInbound).not.toHaveBeenCalled();
			expect(ctx.dialogDecision).toBeUndefined();
			expect(ctx.dialogState).toBeUndefined();
		});
	});

	describe("idle_noop decision", () => {
		it("sets dialogState to idle and dialogContext to null", async () => {
			const manager = createMockManager({ kind: "idle_noop" });
			const step = createEvaluateDialogStateStep({ dialogManager: manager });
			const ctx = createTestContext({ userId: "user-123" });

			await step(ctx, mockLog);

			expect(ctx.dialogDecision).toEqual({ kind: "idle_noop" });
			expect(ctx.dialogState).toBe("idle");
			expect(ctx.dialogContext).toBeNull();
		});
	});

	describe("continue_dialog decision", () => {
		it("sets dialogState and dialogContext from decision", async () => {
			const context = {
				type: "conflict" as const,
				factId: "f1",
				existingContent: "old",
				newContent: "new",
			};
			const decision: DialogDecision = {
				kind: "continue_dialog",
				state: "confirm",
				context,
			};
			const manager = createMockManager(decision);
			const step = createEvaluateDialogStateStep({ dialogManager: manager });
			const ctx = createTestContext({ userId: "user-123", intent: "chat" });

			await step(ctx, mockLog);

			expect(ctx.dialogState).toBe("confirm");
			expect(ctx.dialogContext).toEqual(context);
			expect(mockLog.debug).toHaveBeenCalled();
		});
	});

	describe("reset_timeout decision", () => {
		it("sets dialogState to idle and logs reset metadata", async () => {
			const decision: DialogDecision = {
				kind: "reset_timeout",
				previousState: "confirm",
				previousContextType: "conflict",
			};
			const manager = createMockManager(decision);
			const step = createEvaluateDialogStateStep({ dialogManager: manager });
			const ctx = createTestContext({ userId: "user-123" });

			await step(ctx, mockLog);

			expect(ctx.dialogState).toBe("idle");
			expect(ctx.dialogContext).toBeNull();
			expect(mockLog.info).toHaveBeenCalledWith(
				expect.objectContaining({
					userId: "user-123",
					previousState: "confirm",
					previousContextType: "conflict",
					resetReason: "timeout",
				}),
				"dialog state reset",
			);
		});
	});

	describe("reset_off_topic decision", () => {
		it("sets dialogState to idle and logs reset metadata", async () => {
			const decision: DialogDecision = {
				kind: "reset_off_topic",
				previousState: "await",
				previousContextType: "missing_data",
			};
			const manager = createMockManager(decision);
			const step = createEvaluateDialogStateStep({ dialogManager: manager });
			const ctx = createTestContext({ userId: "user-123" });

			await step(ctx, mockLog);

			expect(ctx.dialogState).toBe("idle");
			expect(ctx.dialogContext).toBeNull();
			expect(mockLog.info).toHaveBeenCalledWith(
				expect.objectContaining({
					resetReason: "off_topic",
				}),
				"dialog state reset",
			);
		});
	});

	describe("recover_recent_reset decision", () => {
		it("sets dialogState to idle and logs recovery metadata", async () => {
			const decision: DialogDecision = {
				kind: "recover_recent_reset",
				resetContext: {
					type: "conflict",
					factId: "f1",
					existingContent: "old",
					newContent: "new",
				},
				resetReason: "timeout",
			};
			const manager = createMockManager(decision);
			const step = createEvaluateDialogStateStep({ dialogManager: manager });
			const ctx = createTestContext({ userId: "user-123" });

			await step(ctx, mockLog);

			expect(ctx.dialogState).toBe("idle");
			expect(ctx.dialogContext).toBeNull();
			expect(mockLog.info).toHaveBeenCalledWith(
				expect.objectContaining({
					recoveredContextType: "conflict",
					resetReason: "timeout",
				}),
				"bare confirmation recovery triggered",
			);
		});
	});

	describe("manager receives correct arguments", () => {
		it("passes userId, intent, and messageText to evaluateInbound", async () => {
			const manager = createMockManager({ kind: "idle_noop" });
			const step = createEvaluateDialogStateStep({ dialogManager: manager });
			const ctx = createTestContext({
				userId: "user-456",
				intent: "memory.save",
				input: { ...TEST_INPUT, text: "Remember this" },
			});

			await step(ctx, mockLog);

			expect(manager.evaluateInbound).toHaveBeenCalledWith(
				"user-456",
				"memory.save",
				"Remember this",
			);
		});

		it("passes undefined intent when not classified", async () => {
			const manager = createMockManager({ kind: "idle_noop" });
			const step = createEvaluateDialogStateStep({ dialogManager: manager });
			const ctx = createTestContext({ userId: "user-456" });

			await step(ctx, mockLog);

			expect(manager.evaluateInbound).toHaveBeenCalledWith(
				"user-456",
				undefined,
				"Hello there",
			);
		});
	});

	describe("metadata-only logging", () => {
		it("does not log message text in continue_dialog", async () => {
			const decision: DialogDecision = {
				kind: "continue_dialog",
				state: "confirm",
				context: {
					type: "conflict",
					factId: "f1",
					existingContent: "old",
					newContent: "new",
				},
			};
			const manager = createMockManager(decision);
			const step = createEvaluateDialogStateStep({ dialogManager: manager });
			const ctx = createTestContext({
				userId: "user-123",
				input: { ...TEST_INPUT, text: "secret user message" },
			});

			await step(ctx, mockLog);

			for (const call of (mockLog.debug as ReturnType<typeof vi.fn>).mock.calls) {
				const loggedMeta = call[0];
				if (typeof loggedMeta === "object" && loggedMeta !== null) {
					const values = Object.values(loggedMeta);
					for (const value of values) {
						expect(String(value)).not.toContain("secret user message");
					}
				}
			}
		});
	});
});

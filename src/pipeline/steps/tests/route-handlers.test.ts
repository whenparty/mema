import type { MessageInput } from "@/shared/types";
import type pino from "pino";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { PipelineContext, RouteHandler } from "../../types";
import { type RouteHandlerDeps, createRouteHandlers } from "../route-handlers";

const TEST_INPUT: MessageInput = {
	text: "some user text that should never appear in logs",
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
		userId: "u-1",
		...overrides,
	};
}

function createMockLog() {
	return {
		debug: vi.fn(),
		info: vi.fn(),
		warn: vi.fn(),
		error: vi.fn(),
	} as unknown as pino.Logger;
}

function createMockDeps(): RouteHandlerDeps & { spies: Record<string, ReturnType<typeof vi.fn>> } {
	const spies = {
		onChat: vi.fn(),
		onMemory: vi.fn(),
		onReminder: vi.fn(),
		onSystem: vi.fn(),
	};
	return { ...spies, spies };
}

describe("createRouteHandlers", () => {
	let mockLog: pino.Logger;

	beforeEach(() => {
		mockLog = createMockLog();
	});

	it("returns an object with all five route handler keys", () => {
		const deps = createMockDeps();
		const handlers = createRouteHandlers(deps);

		expect(handlers).toHaveProperty("chat");
		expect(handlers).toHaveProperty("memory");
		expect(handlers).toHaveProperty("reminder");
		expect(handlers).toHaveProperty("system");
		expect(handlers).toHaveProperty("unknown");
	});

	describe("direct delegation", () => {
		it("chat handler delegates to onChat", async () => {
			const deps = createMockDeps();
			const handlers = createRouteHandlers(deps);
			const ctx = createTestContext({ intent: "chat" });

			await handlers.chat(ctx, mockLog);

			expect(deps.spies.onChat).toHaveBeenCalledOnce();
			expect(deps.spies.onChat).toHaveBeenCalledWith(ctx, mockLog);
		});

		it("memory handler delegates to onMemory", async () => {
			const deps = createMockDeps();
			const handlers = createRouteHandlers(deps);
			const ctx = createTestContext({ intent: "memory.save" });

			await handlers.memory(ctx, mockLog);

			expect(deps.spies.onMemory).toHaveBeenCalledOnce();
			expect(deps.spies.onMemory).toHaveBeenCalledWith(ctx, mockLog);
		});

		it("reminder handler delegates to onReminder", async () => {
			const deps = createMockDeps();
			const handlers = createRouteHandlers(deps);
			const ctx = createTestContext({ intent: "reminder.create" });

			await handlers.reminder(ctx, mockLog);

			expect(deps.spies.onReminder).toHaveBeenCalledOnce();
			expect(deps.spies.onReminder).toHaveBeenCalledWith(ctx, mockLog);
		});

		it("system handler delegates to onSystem", async () => {
			const deps = createMockDeps();
			const handlers = createRouteHandlers(deps);
			const ctx = createTestContext({ intent: "system.pause" });

			await handlers.system(ctx, mockLog);

			expect(deps.spies.onSystem).toHaveBeenCalledOnce();
			expect(deps.spies.onSystem).toHaveBeenCalledWith(ctx, mockLog);
		});
	});

	describe("unknown handler (unknown -> chat delegation)", () => {
		it("delegates to onChat", async () => {
			const deps = createMockDeps();
			const handlers = createRouteHandlers(deps);
			const ctx = createTestContext();

			await handlers.unknown(ctx, mockLog);

			expect(deps.spies.onChat).toHaveBeenCalledOnce();
			expect(deps.spies.onChat).toHaveBeenCalledWith(ctx, mockLog);
		});

		it("does not log warn (logging is consolidated in createRouteStep)", async () => {
			const deps = createMockDeps();
			const handlers = createRouteHandlers(deps);
			const ctx = createTestContext({ userId: "u-42" });

			await handlers.unknown(ctx, mockLog);

			expect(mockLog.warn as ReturnType<typeof vi.fn>).not.toHaveBeenCalled();
		});

		it("does not call onMemory, onReminder, or onSystem", async () => {
			const deps = createMockDeps();
			const handlers = createRouteHandlers(deps);
			const ctx = createTestContext();

			await handlers.unknown(ctx, mockLog);

			expect(deps.spies.onMemory).not.toHaveBeenCalled();
			expect(deps.spies.onReminder).not.toHaveBeenCalled();
			expect(deps.spies.onSystem).not.toHaveBeenCalled();
		});
	});

	describe("handler error propagation", () => {
		it("propagates errors thrown by the delegated handler", async () => {
			const deps = createMockDeps();
			deps.onChat = vi.fn().mockRejectedValue(new Error("handler boom"));
			const handlers = createRouteHandlers(deps);
			const ctx = createTestContext();

			await expect(handlers.chat(ctx, mockLog)).rejects.toThrow("handler boom");
		});

		it("propagates errors from onChat through unknown handler", async () => {
			const deps = createMockDeps();
			deps.onChat = vi.fn().mockRejectedValue(new Error("chat boom via unknown"));
			const handlers = createRouteHandlers(deps);
			const ctx = createTestContext();

			await expect(handlers.unknown(ctx, mockLog)).rejects.toThrow("chat boom via unknown");
		});
	});
});

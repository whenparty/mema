import type { MessageInput } from "@/shared/types";
import type pino from "pino";
import { describe, expect, it, vi } from "vitest";
import { createRouteStep, resolveRoute } from "../router";
import type { PipelineContext, RouteHandlers } from "../types";

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

describe("resolveRoute", () => {
	it("returns 'chat' for 'chat' intent", () => {
		expect(resolveRoute("chat")).toBe("chat");
	});

	it("returns 'memory' for 'memory.save'", () => {
		expect(resolveRoute("memory.save")).toBe("memory");
	});

	it("returns 'memory' for 'memory.delete_entity'", () => {
		expect(resolveRoute("memory.delete_entity")).toBe("memory");
	});

	it("returns 'reminder' for 'reminder.create'", () => {
		expect(resolveRoute("reminder.create")).toBe("reminder");
	});

	it("returns 'system' for 'system.delete_account'", () => {
		expect(resolveRoute("system.delete_account")).toBe("system");
	});

	it("returns 'unknown' for undefined intent", () => {
		expect(resolveRoute(undefined)).toBe("unknown");
	});
});

describe("createRouteStep", () => {
	it("calls correct handler based on intent", async () => {
		const chatHandler = vi.fn();
		const handlers: RouteHandlers = {
			chat: chatHandler,
			memory: vi.fn(),
			reminder: vi.fn(),
			system: vi.fn(),
			unknown: vi.fn(),
		};

		const routeStep = createRouteStep(handlers);
		const ctx = createTestContext({ intent: "chat" });

		await routeStep(ctx, mockLog);

		expect(chatHandler).toHaveBeenCalledOnce();
		expect(chatHandler).toHaveBeenCalledWith(ctx, mockLog);
	});

	it("sets ctx.routeResult to route key", async () => {
		const handlers: RouteHandlers = {
			chat: vi.fn(),
			memory: vi.fn(),
			reminder: vi.fn(),
			system: vi.fn(),
			unknown: vi.fn(),
		};

		const routeStep = createRouteStep(handlers);
		const ctx = createTestContext({ intent: "memory.save" });

		await routeStep(ctx, mockLog);

		expect(ctx.routeResult).toBe("memory");
	});

	it("calls unknown handler when intent is undefined", async () => {
		const unknownHandler = vi.fn();
		const handlers: RouteHandlers = {
			chat: vi.fn(),
			memory: vi.fn(),
			reminder: vi.fn(),
			system: vi.fn(),
			unknown: unknownHandler,
		};

		const routeStep = createRouteStep(handlers);
		const ctx = createTestContext();

		await routeStep(ctx, mockLog);

		expect(unknownHandler).toHaveBeenCalledOnce();
		expect(ctx.routeResult).toBe("unknown");
	});
});

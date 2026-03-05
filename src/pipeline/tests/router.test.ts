import type { Intent, MessageInput } from "@/shared/types";
import type pino from "pino";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createRouteStep, resolveRoute } from "../router";
import type { PipelineContext, RouteHandlerKey, RouteHandlers } from "../types";

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

function createMockLog() {
	return {
		debug: vi.fn(),
		info: vi.fn(),
		warn: vi.fn(),
		error: vi.fn(),
	} as unknown as pino.Logger;
}

function createMockHandlers(): RouteHandlers & {
	spies: Record<RouteHandlerKey, ReturnType<typeof vi.fn>>;
} {
	const spies = {
		chat: vi.fn(),
		memory: vi.fn(),
		reminder: vi.fn(),
		system: vi.fn(),
		unknown: vi.fn(),
	};
	return { ...spies, spies };
}

describe("resolveRoute", () => {
	it("returns 'chat' for 'chat' intent", () => {
		expect(resolveRoute("chat")).toBe("chat");
	});

	describe("memory intents", () => {
		const memoryCases: Intent[] = [
			"memory.save",
			"memory.view",
			"memory.edit",
			"memory.delete",
			"memory.delete_entity",
			"memory.explain",
		];

		it.each(memoryCases)("returns 'memory' for '%s'", (intent) => {
			expect(resolveRoute(intent)).toBe("memory");
		});
	});

	describe("reminder intents", () => {
		const reminderCases: Intent[] = [
			"reminder.create",
			"reminder.list",
			"reminder.cancel",
			"reminder.edit",
		];

		it.each(reminderCases)("returns 'reminder' for '%s'", (intent) => {
			expect(resolveRoute(intent)).toBe("reminder");
		});
	});

	describe("system intents", () => {
		const systemCases: Intent[] = ["system.delete_account", "system.pause", "system.resume"];

		it.each(systemCases)("returns 'system' for '%s'", (intent) => {
			expect(resolveRoute(intent)).toBe("system");
		});
	});

	it("returns 'unknown' for undefined intent", () => {
		expect(resolveRoute(undefined)).toBe("unknown");
	});

	it("returns 'unknown' for invalid taxonomy-like values", () => {
		expect(resolveRoute("memory.invalid" as Intent)).toBe("unknown");
		expect(resolveRoute("reminder.typo" as Intent)).toBe("unknown");
		expect(resolveRoute("system.unknown" as Intent)).toBe("unknown");
	});

	it("covers all 14 intents in the taxonomy", () => {
		const allIntents: Intent[] = [
			"memory.save",
			"memory.view",
			"memory.edit",
			"memory.delete",
			"memory.delete_entity",
			"memory.explain",
			"reminder.create",
			"reminder.list",
			"reminder.cancel",
			"reminder.edit",
			"chat",
			"system.delete_account",
			"system.pause",
			"system.resume",
		];

		for (const intent of allIntents) {
			const result = resolveRoute(intent);
			expect(result).not.toBe("unknown");
		}

		expect(allIntents).toHaveLength(14);
	});
});

describe("createRouteStep", () => {
	let mockLog: pino.Logger;

	beforeEach(() => {
		mockLog = createMockLog();
	});

	it("calls correct handler based on intent", async () => {
		const handlers = createMockHandlers();
		const routeStep = createRouteStep(handlers);
		const ctx = createTestContext({ intent: "chat" });

		await routeStep(ctx, mockLog);

		expect(handlers.spies.chat).toHaveBeenCalledOnce();
		expect(handlers.spies.chat).toHaveBeenCalledWith(ctx, mockLog);
	});

	it("sets ctx.routeResult to route key", async () => {
		const handlers = createMockHandlers();
		const routeStep = createRouteStep(handlers);
		const ctx = createTestContext({ intent: "memory.save" });

		await routeStep(ctx, mockLog);

		expect(ctx.routeResult).toBe("memory");
	});

	it("calls unknown handler when intent is undefined", async () => {
		const handlers = createMockHandlers();
		const routeStep = createRouteStep(handlers);
		const ctx = createTestContext();

		await routeStep(ctx, mockLog);

		expect(handlers.spies.unknown).toHaveBeenCalledOnce();
		expect(ctx.routeResult).toBe("unknown");
	});

	describe("switch-based dispatch routes to each handler family", () => {
		const dispatchCases: Array<[Intent, RouteHandlerKey]> = [
			["chat", "chat"],
			["memory.save", "memory"],
			["reminder.create", "reminder"],
			["system.pause", "system"],
		];

		it.each(dispatchCases)(
			"intent '%s' dispatches to '%s' handler",
			async (intent, expectedKey) => {
				const handlers = createMockHandlers();
				const routeStep = createRouteStep(handlers);
				const ctx = createTestContext({ intent });

				await routeStep(ctx, mockLog);

				expect(handlers.spies[expectedKey]).toHaveBeenCalledOnce();
				for (const [key, spy] of Object.entries(handlers.spies)) {
					if (key !== expectedKey) {
						expect(spy).not.toHaveBeenCalled();
					}
				}
			},
		);
	});

	describe("logging behavior", () => {
		it("logs warn with metadata for unknown route (undefined intent)", async () => {
			const handlers = createMockHandlers();
			const routeStep = createRouteStep(handlers);
			const ctx = createTestContext({ userId: "u-42" });

			await routeStep(ctx, mockLog);

			expect(mockLog.warn as ReturnType<typeof vi.fn>).toHaveBeenCalledWith(
				{ intent: undefined, userId: "u-42", route: "unknown" },
				"unrecognized intent falling back to unknown route",
			);
		});

		it("logs debug with metadata for known routes", async () => {
			const handlers = createMockHandlers();
			const routeStep = createRouteStep(handlers);
			const ctx = createTestContext({ intent: "memory.save" });

			await routeStep(ctx, mockLog);

			expect(mockLog.debug as ReturnType<typeof vi.fn>).toHaveBeenCalledWith(
				{ intent: "memory.save", route: "memory" },
				"routing intent",
			);
		});

		it("does not log warn for known routes", async () => {
			const handlers = createMockHandlers();
			const routeStep = createRouteStep(handlers);
			const ctx = createTestContext({ intent: "chat" });

			await routeStep(ctx, mockLog);

			expect(mockLog.warn as ReturnType<typeof vi.fn>).not.toHaveBeenCalled();
		});

		it("does not include message text in warn log metadata", async () => {
			const handlers = createMockHandlers();
			const routeStep = createRouteStep(handlers);
			const ctx = createTestContext({ userId: "u-99" });

			await routeStep(ctx, mockLog);

			const warnCall = (mockLog.warn as ReturnType<typeof vi.fn>).mock.calls[0];
			const logMeta = warnCall[0] as Record<string, unknown>;
			expect(logMeta).not.toHaveProperty("text");
			expect(logMeta).not.toHaveProperty("message");
			expect(JSON.stringify(logMeta)).not.toContain(TEST_INPUT.text);
		});
	});
});

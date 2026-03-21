import { VALID_INTENTS } from "@/domain/classification/validate";
import type { Intent, MessageInput } from "@/shared/types";
import type pino from "pino";
import { describe, expect, it, vi } from "vitest";
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

const mockLog = {
	debug: vi.fn(),
	info: vi.fn(),
	warn: vi.fn(),
	error: vi.fn(),
} as unknown as pino.Logger;

function expectedRouteForIntent(intent: Intent): RouteHandlerKey {
	if (intent === "chat") return "chat";
	if (intent.startsWith("memory.")) return "memory";
	if (intent.startsWith("reminder.")) return "reminder";
	if (intent.startsWith("system.")) return "system";
	throw new Error(`Unhandled intent in test helper: ${intent}`);
}

describe("resolveRoute", () => {
	describe("maps every canonical intent to its route family", () => {
		for (const intent of VALID_INTENTS) {
			const expected = expectedRouteForIntent(intent);
			it(`routes "${intent}" to "${expected}"`, () => {
				expect(resolveRoute(intent)).toBe(expected);
			});
		}
	});

	it('returns "chat" for undefined intent', () => {
		expect(resolveRoute(undefined)).toBe("chat");
	});

	it('returns "chat" for invalid runtime intent value', () => {
		expect(resolveRoute("not.a.real.intent" as Intent)).toBe("chat");
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
		};

		const routeStep = createRouteStep(handlers);
		const ctx = createTestContext({ intent: "memory.save" });
		await routeStep(ctx, mockLog);

		expect(ctx.routeResult).toBe("memory");
	});

	it('routes undefined intent to chat handler with routeResult "chat"', async () => {
		const chatHandler = vi.fn();
		const handlers: RouteHandlers = {
			chat: chatHandler,
			memory: vi.fn(),
			reminder: vi.fn(),
			system: vi.fn(),
		};

		const routeStep = createRouteStep(handlers);
		const ctx = createTestContext();
		await routeStep(ctx, mockLog);

		expect(ctx.routeResult).toBe("chat");
		expect(chatHandler).toHaveBeenCalledOnce();
	});

	it("handler observes ctx.routeResult already set during invocation", async () => {
		let observedRouteResult: RouteHandlerKey | undefined;
		const memoryHandler = vi.fn(async (ctx: PipelineContext) => {
			observedRouteResult = ctx.routeResult;
		});

		const handlers: RouteHandlers = {
			chat: vi.fn(),
			memory: memoryHandler,
			reminder: vi.fn(),
			system: vi.fn(),
		};

		const routeStep = createRouteStep(handlers);
		const ctx = createTestContext({ intent: "memory.save" });
		await routeStep(ctx, mockLog);

		expect(observedRouteResult).toBe("memory");
	});
});

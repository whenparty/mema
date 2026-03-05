import { describe, expect, it, vi } from "vitest";
import { createDefaultCommandHandlers } from "../handlers";
import { createStopHandler } from "../stop";

function createMockCommandContext() {
	return {
		reply: vi.fn().mockResolvedValue(undefined),
	} as unknown as Parameters<ReturnType<typeof createStopHandler>>[0];
}

describe("/stop", () => {
	it("delegates to injected command handler", async () => {
		const stopFn = vi.fn();
		const commandHandlers = { ...createDefaultCommandHandlers(), stop: stopFn };
		const handler = createStopHandler(commandHandlers);
		const ctx = createMockCommandContext();

		await handler(ctx);

		expect(stopFn).toHaveBeenCalledOnce();
	});

	it("replies with a pause confirmation using defaults", async () => {
		const handler = createStopHandler(createDefaultCommandHandlers());
		const ctx = createMockCommandContext();

		await handler(ctx);

		expect(ctx.reply).toHaveBeenCalledOnce();
		const replyText = (ctx.reply as ReturnType<typeof vi.fn>).mock.calls[0][0] as string;
		expect(replyText).toContain("/start");
	});

	it("propagates errors from injected command handler", async () => {
		const error = new Error("stop failed");
		const commandHandlers = {
			...createDefaultCommandHandlers(),
			stop: vi.fn().mockRejectedValue(error),
		};
		const handler = createStopHandler(commandHandlers);
		const ctx = createMockCommandContext();

		await expect(handler(ctx)).rejects.toThrow(error);
	});
});

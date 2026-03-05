import { describe, expect, it, vi } from "vitest";
import { createDefaultCommandHandlers } from "../handlers";
import { createStartHandler } from "../start";

function createMockCommandContext() {
	return {
		reply: vi.fn().mockResolvedValue(undefined),
	} as unknown as Parameters<ReturnType<typeof createStartHandler>>[0];
}

describe("/start", () => {
	it("delegates to injected command handler", async () => {
		const startFn = vi.fn();
		const commandHandlers = { ...createDefaultCommandHandlers(), start: startFn };
		const handler = createStartHandler(commandHandlers);
		const ctx = createMockCommandContext();

		await handler(ctx);

		expect(startFn).toHaveBeenCalledOnce();
	});

	it("replies with a welcome message using defaults", async () => {
		const handler = createStartHandler(createDefaultCommandHandlers());
		const ctx = createMockCommandContext();

		await handler(ctx);

		expect(ctx.reply).toHaveBeenCalledOnce();
		const replyText = (ctx.reply as ReturnType<typeof vi.fn>).mock.calls[0][0] as string;
		expect(replyText).toContain("Mema");
	});

	it("propagates errors from injected command handler", async () => {
		const error = new Error("start failed");
		const commandHandlers = {
			...createDefaultCommandHandlers(),
			start: vi.fn().mockRejectedValue(error),
		};
		const handler = createStartHandler(commandHandlers);
		const ctx = createMockCommandContext();

		await expect(handler(ctx)).rejects.toThrow(error);
	});
});

import { describe, expect, it, vi } from "vitest";
import { createDefaultCommandHandlers } from "../handlers";
import { createHelpHandler } from "../help";

function createMockCommandContext() {
	return {
		reply: vi.fn().mockResolvedValue(undefined),
	} as unknown as Parameters<ReturnType<typeof createHelpHandler>>[0];
}

describe("/help", () => {
	it("delegates to injected command handler", async () => {
		const helpFn = vi.fn();
		const commandHandlers = { ...createDefaultCommandHandlers(), help: helpFn };
		const handler = createHelpHandler(commandHandlers);
		const ctx = createMockCommandContext();

		await handler(ctx);

		expect(helpFn).toHaveBeenCalledOnce();
	});

	it("replies with a help message using defaults", async () => {
		const handler = createHelpHandler(createDefaultCommandHandlers());
		const ctx = createMockCommandContext();

		await handler(ctx);

		expect(ctx.reply).toHaveBeenCalledOnce();
		const replyText = (ctx.reply as ReturnType<typeof vi.fn>).mock.calls[0][0] as string;
		expect(replyText).toContain("remember");
	});

	it("propagates errors from injected command handler", async () => {
		const error = new Error("help failed");
		const commandHandlers = {
			...createDefaultCommandHandlers(),
			help: vi.fn().mockRejectedValue(error),
		};
		const handler = createHelpHandler(commandHandlers);
		const ctx = createMockCommandContext();

		await expect(handler(ctx)).rejects.toThrow(error);
	});
});

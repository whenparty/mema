import { describe, expect, it, vi } from "vitest";
import { handleHelp } from "../help";

function createMockCommandContext() {
	return {
		reply: vi.fn().mockResolvedValue(undefined),
	} as unknown as Parameters<typeof handleHelp>[0];
}

describe("/help", () => {
	it("replies with a help message", async () => {
		const ctx = createMockCommandContext();

		await handleHelp(ctx);

		expect(ctx.reply).toHaveBeenCalledOnce();
		const replyText = (ctx.reply as ReturnType<typeof vi.fn>).mock.calls[0][0] as string;
		expect(replyText).toContain("remember");
	});
});

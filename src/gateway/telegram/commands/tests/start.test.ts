import { describe, expect, it, vi } from "vitest";
import { handleStart } from "../start";

function createMockCommandContext() {
	return {
		reply: vi.fn().mockResolvedValue(undefined),
	} as unknown as Parameters<typeof handleStart>[0];
}

describe("/start", () => {
	it("replies with a welcome message", async () => {
		const ctx = createMockCommandContext();

		await handleStart(ctx);

		expect(ctx.reply).toHaveBeenCalledOnce();
		const replyText = (ctx.reply as ReturnType<typeof vi.fn>).mock.calls[0][0] as string;
		expect(replyText).toContain("Mema");
	});
});

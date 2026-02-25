import { describe, expect, it, vi } from "vitest";
import { handleStop } from "../stop";

function createMockCommandContext() {
	return {
		reply: vi.fn().mockResolvedValue(undefined),
	} as unknown as Parameters<typeof handleStop>[0];
}

describe("/stop", () => {
	it("replies with a pause confirmation", async () => {
		const ctx = createMockCommandContext();

		await handleStop(ctx);

		expect(ctx.reply).toHaveBeenCalledOnce();
		const replyText = (ctx.reply as ReturnType<typeof vi.fn>).mock.calls[0][0] as string;
		expect(replyText).toContain("/start");
	});
});

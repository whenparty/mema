import { describe, expect, it, vi } from "vitest";
import { handleHelp } from "../help";

const EXPECTED_HELP_MESSAGE = [
	"I remember facts from conversations and use them in responses 🧠",
	"",
	"What I can do:",
	"— Remember: just tell me something",
	'— Remind: "remind me tomorrow at 9 about the meeting"',
	'— Show memory: "what do you know about me?"',
	'— Forget: "forget that I live in Berlin"',
].join("\n");

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
		expect(replyText).toBe(EXPECTED_HELP_MESSAGE);
	});
});

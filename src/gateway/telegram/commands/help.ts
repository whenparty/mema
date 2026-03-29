import type { CommandContext, Context } from "grammy";

const HELP_MESSAGE = [
	"I remember facts from conversations and use them in responses 🧠",
	"",
	"What I can do:",
	"— Remember: just tell me something",
	'— Remind: "remind me tomorrow at 9 about the meeting"',
	'— Show memory: "what do you know about me?"',
	'— Forget: "forget that I live in Berlin"',
].join("\n");

export async function handleHelp(ctx: CommandContext<Context>): Promise<void> {
	await ctx.reply(HELP_MESSAGE);
}

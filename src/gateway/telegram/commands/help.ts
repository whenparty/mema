import type { CommandContext, Context } from "grammy";

export async function handleHelp(ctx: CommandContext<Context>): Promise<void> {
	await ctx.reply("I can remember things for you. Just tell me something!");
}

import type { CommandContext, Context } from "grammy";

export async function handleStart(ctx: CommandContext<Context>): Promise<void> {
	await ctx.reply("Welcome to Mema! I'm your memory assistant.");
}

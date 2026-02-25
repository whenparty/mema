import type { CommandContext, Context } from "grammy";

export async function handleStop(ctx: CommandContext<Context>): Promise<void> {
	await ctx.reply("Pausing. Your data is preserved. Send /start to resume.");
}

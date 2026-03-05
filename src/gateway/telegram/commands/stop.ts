import type { CommandContext, Context } from "grammy";
import type { CommandHandlers } from "../types";

export function createStopHandler(commandHandlers: CommandHandlers) {
	return async (ctx: CommandContext<Context>): Promise<void> => {
		await commandHandlers.stop(async (text) => {
			await ctx.reply(text);
		});
	};
}

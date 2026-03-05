import type { CommandContext, Context } from "grammy";
import type { CommandHandlers } from "../types";

export function createStartHandler(commandHandlers: CommandHandlers) {
	return async (ctx: CommandContext<Context>): Promise<void> => {
		await commandHandlers.start(async (text) => {
			await ctx.reply(text);
		});
	};
}

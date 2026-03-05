import type { CommandContext, Context } from "grammy";
import type { CommandHandlers } from "../types";

export function createHelpHandler(commandHandlers: CommandHandlers) {
	return async (ctx: CommandContext<Context>): Promise<void> => {
		await commandHandlers.help((text) => ctx.reply(text).then(() => {}));
	};
}

import type { CommandHandlers } from "../types";

export function createDefaultCommandHandlers(): CommandHandlers {
	return {
		start: async (reply) => {
			await reply("Welcome to Mema! I'm your memory assistant.");
		},
		help: async (reply) => {
			await reply("I can remember things for you. Just tell me something!");
		},
		stop: async (reply) => {
			await reply("Pausing. Your data is preserved. Send /start to resume.");
		},
	};
}

import { createChildLogger } from "@/shared/logger";
import { Bot, type BotError } from "grammy";
import { handleHelp } from "./commands/help";
import { handleStart } from "./commands/start";
import { handleStop } from "./commands/stop";
import { createDedupGuard } from "./middleware/dedup-guard";
import { privateOnly } from "./middleware/private-only";
import { createUserSerializer } from "./middleware/user-serializer";
import type { TelegramBotConfig, TelegramBotInstance, TelegramMessageInput } from "./types";

const log = createChildLogger({ module: "telegram" });

export function createTelegramBot(config: TelegramBotConfig): TelegramBotInstance {
	const bot = new Bot(config.token, {
		botInfo: config.botInfo,
	});

	// Middleware: only allow private (1:1) chats
	bot.use(privateOnly);

	// Middleware: per-user message serialization (FR-PLT.6)
	const userSerializer = createUserSerializer();
	bot.use(userSerializer.middleware);

	// Middleware: idempotent processing — skip already-processed updates (NFR-REL.3)
	const isDuplicate = config.isDuplicate ?? (async () => false);
	const dedupGuard = createDedupGuard(isDuplicate);
	bot.use(dedupGuard.middleware);

	// Command handlers (stubs)
	bot.command("start", handleStart);
	bot.command("help", handleHelp);
	bot.command("stop", handleStop);

	// Text message handler
	bot.on("message:text", async (ctx) => {
		const from = ctx.message.from;
		const input: TelegramMessageInput = {
			chatId: ctx.chat.id,
			text: ctx.message.text,
			telegramUserId: from.id.toString(),
			username: from.username,
			firstName: from.first_name,
			languageCode: from.language_code,
			updateId: ctx.update.update_id,
		};

		const reply = await config.onMessage(input);
		await ctx.reply(reply);
	});

	// Error handler: log without crashing
	bot.catch((err: BotError) => {
		log.error({ error: err.error, updateId: err.ctx?.update?.update_id }, "bot error caught");
	});

	return {
		bot,
		start: async () => {
			bot
				.start({
					onStart: (botInfo) => {
						log.info(
							{ username: botInfo.username, id: botInfo.id },
							"telegram bot started polling",
						);
					},
				})
				.catch((err: unknown) => {
					log.error(err, "bot polling crashed");
				});
		},
		stop: async () => {
			await bot.stop();
			log.info("telegram bot stopped");
		},
	};
}

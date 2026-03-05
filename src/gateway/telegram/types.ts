import type { UserFromGetMe } from "@grammyjs/types";
import type { Bot } from "grammy";

export type DuplicateChecker = (telegramUserId: string, updateId: number) => Promise<boolean>;

export interface TelegramMessageInput {
	chatId: number;
	text: string;
	telegramUserId: string;
	username: string | undefined;
	firstName: string;
	languageCode: string | undefined;
	updateId: number;
}

export type MessageHandler = (input: TelegramMessageInput) => Promise<string>;

export type CommandReply = (text: string) => Promise<void>;

export interface CommandHandlers {
	start: (reply: CommandReply) => Promise<void>;
	help: (reply: CommandReply) => Promise<void>;
	stop: (reply: CommandReply) => Promise<void>;
}

export interface TelegramBotConfig {
	token: string;
	onMessage: MessageHandler;
	/** Pre-initialized bot info to skip the getMe() API call. Useful for testing. */
	botInfo?: UserFromGetMe;
	/** Checks if a Telegram update has already been processed. Used for idempotency. */
	isDuplicate?: DuplicateChecker;
	/** Injectable command handlers. Uses defaults if not provided. */
	commandHandlers?: CommandHandlers;
}

export interface TelegramBotInstance {
	/** The underlying grammy Bot instance. Exposed for testing (e.g. handleUpdate, API transformers). */
	bot: Bot;
	start: () => Promise<void>;
	stop: () => Promise<void>;
}

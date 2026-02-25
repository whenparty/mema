import type { UserFromGetMe } from "@grammyjs/types";
import type { Bot } from "grammy";

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

export interface TelegramBotConfig {
	token: string;
	onMessage: MessageHandler;
	/** Pre-initialized bot info to skip the getMe() API call. Useful for testing. */
	botInfo?: UserFromGetMe;
}

export interface TelegramBotInstance {
	/** The underlying grammy Bot instance. Exposed for testing (e.g. handleUpdate, API transformers). */
	bot: Bot;
	start: () => Promise<void>;
	stop: () => Promise<void>;
}

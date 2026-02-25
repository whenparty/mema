import type { ApiResponse, UserFromGetMe } from "@grammyjs/types";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createTelegramBot } from "../bot";
import type { TelegramBotConfig, TelegramBotInstance } from "../types";

// Mock logger to avoid noisy output during tests
vi.mock("@/shared/logger", () => {
	const mockLogger = {
		info: vi.fn(),
		warn: vi.fn(),
		error: vi.fn(),
		debug: vi.fn(),
		child: vi.fn().mockReturnThis(),
	};
	return {
		createChildLogger: vi.fn().mockReturnValue(mockLogger),
		logger: mockLogger,
	};
});

const TEST_BOT_INFO: UserFromGetMe = {
	id: 1,
	is_bot: true,
	first_name: "TestBot",
	username: "test_bot",
	can_join_groups: false,
	can_read_all_group_messages: false,
	supports_inline_queries: false,
	can_connect_to_business: false,
	has_main_web_app: false,
	has_topics_enabled: false,
	allows_users_to_create_topics: false,
};

interface CapturedCall {
	method: string;
	payload: Record<string, unknown>;
}

function createTestBot(onMessage: TelegramBotConfig["onMessage"]): {
	instance: TelegramBotInstance;
	captured: CapturedCall[];
} {
	const captured: CapturedCall[] = [];

	const config: TelegramBotConfig = {
		token: "fake-token-for-integration-test",
		onMessage,
		botInfo: TEST_BOT_INFO,
	};

	const instance = createTelegramBot(config);

	// Install API transformer to intercept all outgoing API calls
	instance.bot.api.config.use((prev, method, payload) => {
		captured.push({
			method,
			payload: payload as Record<string, unknown>,
		});

		// Return a fake successful response without hitting Telegram
		return Promise.resolve({
			ok: true as const,
			result: true as unknown,
		} as ApiResponse<Awaited<ReturnType<typeof prev>>>);
	});

	return { instance, captured };
}

function makePrivateTextUpdate(
	updateId: number,
	text: string,
	options?: { userId?: number; firstName?: string; username?: string },
) {
	const userId = options?.userId ?? 42;
	const firstName = options?.firstName ?? "Alice";
	const username = options?.username ?? "alice";

	return {
		update_id: updateId,
		message: {
			message_id: updateId,
			from: {
				id: userId,
				is_bot: false,
				first_name: firstName,
				username,
				language_code: "en",
			},
			chat: {
				id: userId,
				first_name: firstName,
				username,
				type: "private" as const,
			},
			date: Math.floor(Date.now() / 1000),
			text,
		},
	};
}

function makePrivateCommandUpdate(
	updateId: number,
	command: string,
	options?: { userId?: number; firstName?: string; username?: string },
) {
	const userId = options?.userId ?? 42;
	const firstName = options?.firstName ?? "Alice";
	const username = options?.username ?? "alice";
	const commandText = `/${command}`;

	return {
		update_id: updateId,
		message: {
			message_id: updateId,
			from: {
				id: userId,
				is_bot: false,
				first_name: firstName,
				username,
				language_code: "en",
			},
			chat: {
				id: userId,
				first_name: firstName,
				username,
				type: "private" as const,
			},
			date: Math.floor(Date.now() / 1000),
			text: commandText,
			entities: [
				{
					offset: 0,
					length: commandText.length,
					type: "bot_command" as const,
				},
			],
		},
	};
}

function makeGroupTextUpdate(updateId: number, text: string) {
	return {
		update_id: updateId,
		message: {
			message_id: updateId,
			from: {
				id: 42,
				is_bot: false,
				first_name: "Alice",
				username: "alice",
				language_code: "en",
			},
			chat: {
				id: -100123,
				title: "Test Group",
				type: "group" as const,
			},
			date: Math.floor(Date.now() / 1000),
			text,
		},
	};
}

function makeGroupCommandUpdate(updateId: number, command: string) {
	const commandText = `/${command}`;
	return {
		update_id: updateId,
		message: {
			message_id: updateId,
			from: {
				id: 42,
				is_bot: false,
				first_name: "Alice",
				username: "alice",
				language_code: "en",
			},
			chat: {
				id: -100123,
				title: "Test Group",
				type: "group" as const,
			},
			date: Math.floor(Date.now() / 1000),
			text: commandText,
			entities: [
				{
					offset: 0,
					length: commandText.length,
					type: "bot_command" as const,
				},
			],
		},
	};
}

describe("telegram bot integration", () => {
	let instance: TelegramBotInstance;
	let captured: CapturedCall[];
	let onMessage: ReturnType<typeof vi.fn>;

	beforeEach(() => {
		onMessage = vi.fn().mockResolvedValue("echo reply");
		const result = createTestBot(onMessage);
		instance = result.instance;
		captured = result.captured;
	});

	afterEach(async () => {
		captured.length = 0;
	});

	describe("/start command in private chat", () => {
		it("replies with the welcome message", async () => {
			const update = makePrivateCommandUpdate(1, "start");
			await instance.bot.handleUpdate(update);

			expect(captured).toHaveLength(1);
			expect(captured[0].method).toBe("sendMessage");
			expect(captured[0].payload.text).toBe("Welcome to Mema! I'm your memory assistant.");
			expect(captured[0].payload.chat_id).toBe(42);
		});
	});

	describe("/help command in private chat", () => {
		it("replies with the help message", async () => {
			const update = makePrivateCommandUpdate(2, "help");
			await instance.bot.handleUpdate(update);

			expect(captured).toHaveLength(1);
			expect(captured[0].method).toBe("sendMessage");
			expect(captured[0].payload.text).toBe(
				"I can remember things for you. Just tell me something!",
			);
			expect(captured[0].payload.chat_id).toBe(42);
		});
	});

	describe("/stop command in private chat", () => {
		it("replies with the pause confirmation", async () => {
			const update = makePrivateCommandUpdate(3, "stop");
			await instance.bot.handleUpdate(update);

			expect(captured).toHaveLength(1);
			expect(captured[0].method).toBe("sendMessage");
			expect(captured[0].payload.text).toBe(
				"Pausing. Your data is preserved. Send /start to resume.",
			);
			expect(captured[0].payload.chat_id).toBe(42);
		});
	});

	describe("text message in private chat", () => {
		it("calls onMessage and replies with the returned text", async () => {
			onMessage.mockResolvedValue("I will remember that!");
			const update = makePrivateTextUpdate(4, "My favorite color is blue");

			await instance.bot.handleUpdate(update);

			expect(onMessage).toHaveBeenCalledOnce();
			expect(onMessage).toHaveBeenCalledWith({
				chatId: 42,
				text: "My favorite color is blue",
				telegramUserId: "42",
				username: "alice",
				firstName: "Alice",
				languageCode: "en",
				updateId: 4,
			});

			expect(captured).toHaveLength(1);
			expect(captured[0].method).toBe("sendMessage");
			expect(captured[0].payload.text).toBe("I will remember that!");
			expect(captured[0].payload.chat_id).toBe(42);
		});
	});

	describe("message from a group chat", () => {
		it("is silently dropped by privateOnly middleware", async () => {
			const update = makeGroupTextUpdate(5, "Hello from a group");
			await instance.bot.handleUpdate(update);

			expect(onMessage).not.toHaveBeenCalled();
			expect(captured).toHaveLength(0);
		});
	});

	describe("/start command from a group chat", () => {
		it("is silently dropped by privateOnly middleware", async () => {
			const update = makeGroupCommandUpdate(6, "start");
			await instance.bot.handleUpdate(update);

			expect(onMessage).not.toHaveBeenCalled();
			expect(captured).toHaveLength(0);
		});
	});
});

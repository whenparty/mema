import type { UserFromGetMe } from "@grammyjs/types";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { TelegramBotConfig, TelegramMessageInput } from "../types";

// Mock grammy to avoid real Telegram API calls
const mockBotStart = vi.fn().mockResolvedValue(undefined);
const mockBotStop = vi.fn().mockResolvedValue(undefined);
const mockBotCommand = vi.fn();
const mockBotOn = vi.fn();
const mockBotUse = vi.fn();
const mockBotCatch = vi.fn();

const fakeBotInfo: UserFromGetMe = {
	id: 123456,
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

vi.mock("grammy", () => {
	return {
		Bot: vi.fn().mockImplementation(() => ({
			start: mockBotStart,
			stop: mockBotStop,
			command: mockBotCommand,
			on: mockBotOn,
			use: mockBotUse,
			catch: mockBotCatch,
			botInfo: fakeBotInfo,
		})),
		BotError: class BotError extends Error {},
	};
});

// Mock logger to avoid noisy output during tests
const mockLogger = {
	info: vi.fn(),
	warn: vi.fn(),
	error: vi.fn(),
	debug: vi.fn(),
	child: vi.fn().mockReturnThis(),
};

vi.mock("@/shared/logger", () => {
	return {
		createChildLogger: vi.fn().mockReturnValue(mockLogger),
		logger: mockLogger,
	};
});

describe("createTelegramBot", () => {
	beforeEach(() => {
		mockBotStart.mockClear();
		mockBotStop.mockClear();
		mockBotCommand.mockClear();
		mockBotOn.mockClear();
		mockBotUse.mockClear();
		mockBotCatch.mockClear();
		mockLogger.info.mockClear();
		mockLogger.warn.mockClear();
		mockLogger.error.mockClear();
		mockLogger.debug.mockClear();
	});

	it("returns an object with start and stop methods", async () => {
		const { createTelegramBot } = await import("../bot");
		const config: TelegramBotConfig = {
			token: "test-token-123",
			onMessage: vi.fn().mockResolvedValue("reply"),
		};

		const instance = createTelegramBot(config);

		expect(instance).toHaveProperty("start");
		expect(instance).toHaveProperty("stop");
		expect(typeof instance.start).toBe("function");
		expect(typeof instance.stop).toBe("function");
	});

	it("creates a Bot with the provided token", async () => {
		const { createTelegramBot } = await import("../bot");
		const { Bot } = await import("grammy");
		const config: TelegramBotConfig = {
			token: "test-token-456",
			onMessage: vi.fn().mockResolvedValue("reply"),
		};

		createTelegramBot(config);

		expect(Bot).toHaveBeenCalledWith("test-token-456", expect.any(Object));
	});

	it("registers the private-only middleware", async () => {
		const { createTelegramBot } = await import("../bot");
		const config: TelegramBotConfig = {
			token: "test-token",
			onMessage: vi.fn().mockResolvedValue("reply"),
		};

		createTelegramBot(config);

		expect(mockBotUse).toHaveBeenCalled();
	});

	it("registers private-only, user-serializer, and dedup-guard middleware in order", async () => {
		const { createTelegramBot } = await import("../bot");
		const config: TelegramBotConfig = {
			token: "test-token",
			onMessage: vi.fn().mockResolvedValue("reply"),
		};

		createTelegramBot(config);

		// private-only (1st), user-serializer (2nd), dedup-guard (3rd)
		expect(mockBotUse).toHaveBeenCalledTimes(3);
		expect(typeof mockBotUse.mock.calls[0][0]).toBe("function");
		expect(typeof mockBotUse.mock.calls[1][0]).toBe("function");
		expect(typeof mockBotUse.mock.calls[2][0]).toBe("function");
	});

	it("registers /start, /help, and /stop commands", async () => {
		const { createTelegramBot } = await import("../bot");
		const config: TelegramBotConfig = {
			token: "test-token",
			onMessage: vi.fn().mockResolvedValue("reply"),
		};

		createTelegramBot(config);

		const registeredCommands = mockBotCommand.mock.calls.map((call: unknown[]) => call[0]);
		expect(registeredCommands).toContain("start");
		expect(registeredCommands).toContain("help");
		expect(registeredCommands).toContain("stop");
	});

	it("registers a message:text handler", async () => {
		const { createTelegramBot } = await import("../bot");
		const config: TelegramBotConfig = {
			token: "test-token",
			onMessage: vi.fn().mockResolvedValue("reply"),
		};

		createTelegramBot(config);

		expect(mockBotOn).toHaveBeenCalledWith("message:text", expect.any(Function));
	});

	it("registers an error handler via bot.catch", async () => {
		const { createTelegramBot } = await import("../bot");
		const config: TelegramBotConfig = {
			token: "test-token",
			onMessage: vi.fn().mockResolvedValue("reply"),
		};

		createTelegramBot(config);

		expect(mockBotCatch).toHaveBeenCalledWith(expect.any(Function));
	});

	it("text handler calls onMessage with correct input and replies", async () => {
		const { createTelegramBot } = await import("../bot");
		const onMessage = vi.fn().mockResolvedValue("bot response");
		const config: TelegramBotConfig = {
			token: "test-token",
			onMessage,
		};

		createTelegramBot(config);

		// Extract the registered text handler
		const textHandlerCall = mockBotOn.mock.calls.find(
			(call: unknown[]) => call[0] === "message:text",
		);
		if (!textHandlerCall) {
			throw new Error("text handler not registered");
		}
		const textHandler = textHandlerCall[1] as (ctx: unknown) => Promise<void>;

		const mockCtx = {
			message: {
				text: "Hello bot",
				from: {
					id: 98765,
					first_name: "TestUser",
					username: "testuser",
					language_code: "en",
				},
			},
			chat: { id: 11111 },
			update: { update_id: 42 },
			reply: vi.fn().mockResolvedValue(undefined),
		};

		await textHandler(mockCtx);

		expect(onMessage).toHaveBeenCalledOnce();
		const input = onMessage.mock.calls[0][0] as TelegramMessageInput;
		expect(input.chatId).toBe(11111);
		expect(input.text).toBe("Hello bot");
		expect(input.telegramUserId).toBe("98765");
		expect(input.username).toBe("testuser");
		expect(input.firstName).toBe("TestUser");
		expect(input.languageCode).toBe("en");
		expect(input.updateId).toBe(42);

		expect(mockCtx.reply).toHaveBeenCalledWith("bot response");
	});

	it("error handler logs the error without rethrowing", async () => {
		const { createTelegramBot } = await import("../bot");
		const config: TelegramBotConfig = {
			token: "test-token",
			onMessage: vi.fn().mockResolvedValue("reply"),
		};

		createTelegramBot(config);

		const errorHandler = mockBotCatch.mock.calls[0][0] as (err: unknown) => void;
		const mockError = {
			error: new Error("test error"),
			ctx: { update: { update_id: 99 } },
		};

		// Should not throw
		expect(() => errorHandler(mockError)).not.toThrow();

		expect(mockLogger.error).toHaveBeenCalled();
	});

	it("start() calls bot.start() with onStart callback", async () => {
		const { createTelegramBot } = await import("../bot");
		const config: TelegramBotConfig = {
			token: "test-token",
			onMessage: vi.fn().mockResolvedValue("reply"),
		};

		const instance = createTelegramBot(config);
		await instance.start();

		expect(mockBotStart).toHaveBeenCalledWith(
			expect.objectContaining({ onStart: expect.any(Function) }),
		);
	});

	it("stop() calls bot.stop()", async () => {
		const { createTelegramBot } = await import("../bot");
		const config: TelegramBotConfig = {
			token: "test-token",
			onMessage: vi.fn().mockResolvedValue("reply"),
		};

		const instance = createTelegramBot(config);
		await instance.stop();

		expect(mockBotStop).toHaveBeenCalledOnce();
	});
});

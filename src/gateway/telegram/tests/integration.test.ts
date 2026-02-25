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

	describe("per-user serialization", () => {
		it("processes messages from the same user sequentially", async () => {
			const executionOrder: string[] = [];
			let firstResolve = (): void => {};
			const firstBlocked = new Promise<void>((resolve) => {
				firstResolve = resolve;
			});

			let callCount = 0;
			onMessage.mockImplementation(async () => {
				callCount++;
				const label = callCount === 1 ? "first" : "second";
				executionOrder.push(`${label}-start`);
				if (label === "first") {
					await firstBlocked;
				}
				executionOrder.push(`${label}-end`);
				return `${label} reply`;
			});

			const update1 = makePrivateTextUpdate(10, "Message one", { userId: 42 });
			const update2 = makePrivateTextUpdate(11, "Message two", { userId: 42 });

			const promise1 = instance.bot.handleUpdate(update1);
			const promise2 = instance.bot.handleUpdate(update2);

			// Let microtasks settle - only first should be running
			await new Promise((resolve) => setTimeout(resolve, 10));
			expect(executionOrder).toEqual(["first-start"]);

			// Release first
			firstResolve();
			await Promise.all([promise1, promise2]);

			expect(executionOrder).toEqual(["first-start", "first-end", "second-start", "second-end"]);
		});

		it("processes messages from different users in parallel", async () => {
			const executionOrder: string[] = [];
			let user1Resolve = (): void => {};
			let user2Resolve = (): void => {};
			const user1Blocked = new Promise<void>((resolve) => {
				user1Resolve = resolve;
			});
			const user2Blocked = new Promise<void>((resolve) => {
				user2Resolve = resolve;
			});

			onMessage.mockImplementation(async (input: { telegramUserId: string }) => {
				const label = input.telegramUserId === "42" ? "user1" : "user2";
				executionOrder.push(`${label}-start`);
				if (label === "user1") {
					await user1Blocked;
				} else {
					await user2Blocked;
				}
				executionOrder.push(`${label}-end`);
				return `${label} reply`;
			});

			const update1 = makePrivateTextUpdate(20, "From user 1", {
				userId: 42,
				firstName: "Alice",
				username: "alice",
			});
			const update2 = makePrivateTextUpdate(21, "From user 2", {
				userId: 99,
				firstName: "Bob",
				username: "bob",
			});

			const promise1 = instance.bot.handleUpdate(update1);
			const promise2 = instance.bot.handleUpdate(update2);

			// Let microtasks settle - both should be running
			await new Promise((resolve) => setTimeout(resolve, 10));
			expect(executionOrder).toContain("user1-start");
			expect(executionOrder).toContain("user2-start");

			user1Resolve();
			user2Resolve();
			await Promise.all([promise1, promise2]);
		});

		it("continues processing after an error in a previous message", async () => {
			const executionOrder: string[] = [];
			let callCount = 0;

			onMessage.mockImplementation(async () => {
				callCount++;
				if (callCount === 1) {
					executionOrder.push("failing-start");
					throw new Error("handler error");
				}
				executionOrder.push("second-start");
				executionOrder.push("second-end");
				return "recovery reply";
			});

			const update1 = makePrivateTextUpdate(30, "Will fail", { userId: 42 });
			const update2 = makePrivateTextUpdate(31, "Should succeed", { userId: 42 });

			// handleUpdate() throws BotError directly (bot.catch is only used
			// during the polling loop via handleUpdates). Queue both, then
			// let the first error propagate and verify the second still runs.
			const promise1 = instance.bot.handleUpdate(update1).catch(() => {
				// Expected: first message handler throws
			});
			const promise2 = instance.bot.handleUpdate(update2);

			await Promise.all([promise1, promise2]);

			expect(executionOrder).toContain("second-start");
			expect(executionOrder).toContain("second-end");
		});
	});
});

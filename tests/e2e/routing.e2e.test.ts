import type { ApiResponse, UserFromGetMe } from "@grammyjs/types";
import { VALID_INTENTS } from "@/domain/classification/validate";
import { createTelegramBot } from "@/gateway/telegram/bot";
import type {
	CommandHandlers,
	MessageHandler,
	TelegramBotConfig,
	TelegramBotInstance,
	TelegramMessageInput,
} from "@/gateway/telegram/types";
import { FALLBACK_RESPONSE, createPipeline } from "@/pipeline/orchestrator";
import { createRouteStep, resolveRoute } from "@/pipeline/router";
import { createRouteHandlers } from "@/pipeline/steps/route-handlers";
import { createStubSteps } from "@/pipeline/steps/stubs";
import type { PipelineContext, PipelineStep, RouteHandlerKey } from "@/pipeline/types";
import type { Intent, MessageInput } from "@/shared/types";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

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
	first_name: "MemaBot",
	username: "mema_bot",
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

interface RouteRecord {
	intent: Intent | undefined;
	routeKey: RouteHandlerKey;
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

/**
 * Creates a classification step that can be controlled externally.
 * Returns a setter to change the classified intent for each message.
 */
function createControllableClassificationStep() {
	let nextIntent: Intent | undefined = "chat";
	const calls: Array<{ text: string; intent: Intent | undefined }> = [];

	const step: PipelineStep = async (ctx: PipelineContext) => {
		const intent = nextIntent;
		calls.push({ text: ctx.input.text, intent });
		ctx.intent = intent;
		ctx.complexity = intent === "chat" ? "trivial" : "standard";
	};

	return {
		step,
		calls,
		setNextIntent(intent: Intent | undefined) {
			nextIntent = intent;
		},
	};
}

/**
 * Creates route handler deps that record which handler families were invoked.
 */
function createRecordingRouteHandlers() {
	const dispatched: RouteRecord[] = [];
	let throwOnRoute: RouteHandlerKey | null = null;

	const handler = (family: RouteHandlerKey): PipelineStep => {
		return async (ctx: PipelineContext) => {
			dispatched.push({ intent: ctx.intent, routeKey: family });
			if (throwOnRoute === family) {
				throw new Error(`${family} handler error`);
			}
		};
	};

	const routeHandlers = createRouteHandlers({
		onChat: handler("chat"),
		onMemory: handler("memory"),
		onReminder: handler("reminder"),
		onSystem: handler("system"),
	});

	return {
		routeHandlers,
		dispatched,
		setThrowOnRoute(route: RouteHandlerKey | null) {
			throwOnRoute = route;
		},
	};
}

/**
 * Wires the full gateway-to-pipeline-to-routing flow.
 * Classification is controllable; route handlers record dispatch.
 */
function createE2EHarness() {
	const classification = createControllableClassificationStep();
	const recording = createRecordingRouteHandlers();

	const routeStep = createRouteStep(recording.routeHandlers);
	const steps = createStubSteps({
		classifyIntentAndComplexity: classification.step,
		routeIntent: routeStep,
	});
	const pipeline = createPipeline(steps);

	const pipelineCalls: TelegramMessageInput[] = [];

	const onMessage: MessageHandler = async (input) => {
		pipelineCalls.push(input);
		const messageInput: MessageInput = {
			text: input.text,
			externalUserId: input.telegramUserId,
			username: input.username,
			firstName: input.firstName,
			languageCode: input.languageCode,
			platformUpdateId: input.updateId,
		};
		return pipeline(messageInput);
	};

	const captured: CapturedCall[] = [];

	const config: TelegramBotConfig = {
		token: "fake-token-e2e",
		onMessage,
		botInfo: TEST_BOT_INFO,
	};

	const instance = createTelegramBot(config);

	instance.bot.api.config.use((prev, method, payload) => {
		captured.push({ method, payload: payload as Record<string, unknown> });
		return Promise.resolve({
			ok: true as const,
			result: true as unknown,
		} as ApiResponse<Awaited<ReturnType<typeof prev>>>);
	});

	return {
		instance,
		captured,
		classification,
		recording,
		pipelineCalls,
	};
}

describe("E2E: Routing — gateway to pipeline to handler dispatch", () => {
	let harness: ReturnType<typeof createE2EHarness>;

	beforeEach(() => {
		harness = createE2EHarness();
	});

	afterEach(() => {
		harness.captured.length = 0;
	});

	describe("AC1 + AC5: commands dispatch directly and bypass the pipeline", () => {
		it("/start command replies without invoking the pipeline", async () => {
			const update = makePrivateCommandUpdate(1, "start");
			await harness.instance.bot.handleUpdate(update);

			expect(harness.pipelineCalls).toHaveLength(0);
			expect(harness.recording.dispatched).toHaveLength(0);
			expect(harness.captured).toHaveLength(1);
			expect(harness.captured[0].method).toBe("sendMessage");
			expect(harness.captured[0].payload.text).toContain("Mema");
		});

		it("/help command replies without invoking the pipeline", async () => {
			const update = makePrivateCommandUpdate(2, "help");
			await harness.instance.bot.handleUpdate(update);

			expect(harness.pipelineCalls).toHaveLength(0);
			expect(harness.recording.dispatched).toHaveLength(0);
			expect(harness.captured).toHaveLength(1);
			expect(harness.captured[0].method).toBe("sendMessage");
			expect(harness.captured[0].payload.text).toContain("remember");
		});

		it("/stop command replies without invoking the pipeline", async () => {
			const update = makePrivateCommandUpdate(3, "stop");
			await harness.instance.bot.handleUpdate(update);

			expect(harness.pipelineCalls).toHaveLength(0);
			expect(harness.recording.dispatched).toHaveLength(0);
			expect(harness.captured).toHaveLength(1);
			expect(harness.captured[0].method).toBe("sendMessage");
			expect(harness.captured[0].payload.text).toContain("Pausing");
		});
	});

	describe("AC2: free-text intents map to correct handler families", () => {
		const familyMapping: Array<{ intent: Intent; expectedRoute: RouteHandlerKey }> = [
			{ intent: "memory.save", expectedRoute: "memory" },
			{ intent: "memory.view", expectedRoute: "memory" },
			{ intent: "memory.edit", expectedRoute: "memory" },
			{ intent: "memory.delete", expectedRoute: "memory" },
			{ intent: "memory.delete_entity", expectedRoute: "memory" },
			{ intent: "memory.explain", expectedRoute: "memory" },
			{ intent: "reminder.create", expectedRoute: "reminder" },
			{ intent: "reminder.list", expectedRoute: "reminder" },
			{ intent: "reminder.cancel", expectedRoute: "reminder" },
			{ intent: "reminder.edit", expectedRoute: "reminder" },
			{ intent: "chat", expectedRoute: "chat" },
			{ intent: "system.delete_account", expectedRoute: "system" },
			{ intent: "system.pause", expectedRoute: "system" },
			{ intent: "system.resume", expectedRoute: "system" },
		];

		it.each(familyMapping)(
			"intent $intent routes to $expectedRoute handler",
			async ({ intent, expectedRoute }) => {
				harness.classification.setNextIntent(intent);
				const update = makePrivateTextUpdate(100, "some user message");
				await harness.instance.bot.handleUpdate(update);

				expect(harness.pipelineCalls).toHaveLength(1);
				expect(harness.recording.dispatched).toHaveLength(1);
				expect(harness.recording.dispatched[0].routeKey).toBe(expectedRoute);

				expect(harness.captured).toHaveLength(1);
				expect(harness.captured[0].method).toBe("sendMessage");

				harness.pipelineCalls.length = 0;
				harness.recording.dispatched.length = 0;
				harness.captured.length = 0;
			},
		);

		it("covers all 14 intents in the taxonomy", () => {
			const mappedIntents = familyMapping.map((m) => m.intent).sort();
			const taxonomyIntents = [...VALID_INTENTS].sort();
			expect(mappedIntents).toEqual(taxonomyIntents);
		});
	});

	describe("AC3: pipeline routing order preserved — classification before route step", () => {
		it("classification step is invoked before route dispatch", async () => {
			harness.classification.setNextIntent("memory.save");
			const update = makePrivateTextUpdate(200, "Remember my birthday is March 5");
			await harness.instance.bot.handleUpdate(update);

			expect(harness.classification.calls).toHaveLength(1);
			expect(harness.recording.dispatched).toHaveLength(1);
			expect(harness.recording.dispatched[0].intent).toBe("memory.save");
			expect(harness.recording.dispatched[0].routeKey).toBe("memory");
		});
	});

	describe("AC4: unknown/undefined intents fall back to chat", () => {
		it("undefined intent routes to unknown and delegates to chat handler", async () => {
			harness.classification.setNextIntent(undefined);
			const update = makePrivateTextUpdate(300, "garbled input");
			await harness.instance.bot.handleUpdate(update);

			expect(harness.recording.dispatched).toHaveLength(1);
			expect(harness.recording.dispatched[0].routeKey).toBe("chat");
		});

		it("resolveRoute returns unknown for undefined intent", () => {
			expect(resolveRoute(undefined)).toBe("unknown");
		});
	});

	describe("AC5 + EC4: command-like text without entity goes through pipeline", () => {
		it("plain text '/start' without bot_command entity is processed as free text", async () => {
			harness.classification.setNextIntent("chat");
			const update = makePrivateTextUpdate(400, "/start");
			await harness.instance.bot.handleUpdate(update);

			expect(harness.pipelineCalls).toHaveLength(1);
			expect(harness.pipelineCalls[0].text).toBe("/start");
			expect(harness.recording.dispatched).toHaveLength(1);
			expect(harness.recording.dispatched[0].routeKey).toBe("chat");
		});
	});

	describe("AC6: command semantics preserved through DI", () => {
		it("/start reply text contains welcome mention of Mema", async () => {
			const update = makePrivateCommandUpdate(500, "start");
			await harness.instance.bot.handleUpdate(update);

			const replyText = harness.captured[0].payload.text as string;
			expect(replyText).toContain("Mema");
			expect(replyText).toContain("memory assistant");
		});

		it("/stop reply text contains /start resume instruction and Pausing", async () => {
			const update = makePrivateCommandUpdate(501, "stop");
			await harness.instance.bot.handleUpdate(update);

			const replyText = harness.captured[0].payload.text as string;
			expect(replyText).toContain("/start");
			expect(replyText).toContain("Pausing");
		});
	});

	describe("AC7: typed factory contracts support downstream handler wiring", () => {
		it("custom command handlers are injected and used instead of defaults", async () => {
			const customHandlers: CommandHandlers = {
				start: async (reply) => {
					await reply("Custom start!");
				},
				help: async (reply) => {
					await reply("Custom help!");
				},
				stop: async (reply) => {
					await reply("Custom stop!");
				},
			};

			const classification = createControllableClassificationStep();
			const recording = createRecordingRouteHandlers();
			const routeStep = createRouteStep(recording.routeHandlers);
			const steps = createStubSteps({
				classifyIntentAndComplexity: classification.step,
				routeIntent: routeStep,
			});
			const pipeline = createPipeline(steps);

			const onMessage: MessageHandler = async (input) => {
				return pipeline({
					text: input.text,
					externalUserId: input.telegramUserId,
					username: input.username,
					firstName: input.firstName,
					languageCode: input.languageCode,
					platformUpdateId: input.updateId,
				});
			};

			const captured: CapturedCall[] = [];
			const instance = createTelegramBot({
				token: "fake-token",
				onMessage,
				botInfo: TEST_BOT_INFO,
				commandHandlers: customHandlers,
			});

			instance.bot.api.config.use((prev, method, payload) => {
				captured.push({ method, payload: payload as Record<string, unknown> });
				return Promise.resolve({
					ok: true as const,
					result: true as unknown,
				} as ApiResponse<Awaited<ReturnType<typeof prev>>>);
			});

			const update = makePrivateCommandUpdate(600, "start");
			await instance.bot.handleUpdate(update);

			expect(captured).toHaveLength(1);
			expect(captured[0].payload.text).toBe("Custom start!");
		});
	});

	describe("EC1: classifier unavailable — commands still work", () => {
		it("commands succeed even when classification step throws", async () => {
			const failingClassification: PipelineStep = async () => {
				throw new Error("LLM unavailable");
			};

			const recording = createRecordingRouteHandlers();
			const routeStep = createRouteStep(recording.routeHandlers);
			const steps = createStubSteps({
				classifyIntentAndComplexity: failingClassification,
				routeIntent: routeStep,
			});
			const pipeline = createPipeline(steps);

			const onMessage: MessageHandler = async (input) => {
				return pipeline({
					text: input.text,
					externalUserId: input.telegramUserId,
					username: input.username,
					firstName: input.firstName,
					languageCode: input.languageCode,
					platformUpdateId: input.updateId,
				});
			};

			const captured: CapturedCall[] = [];
			const instance = createTelegramBot({
				token: "fake-token",
				onMessage,
				botInfo: TEST_BOT_INFO,
			});

			instance.bot.api.config.use((prev, method, payload) => {
				captured.push({ method, payload: payload as Record<string, unknown> });
				return Promise.resolve({
					ok: true as const,
					result: true as unknown,
				} as ApiResponse<Awaited<ReturnType<typeof prev>>>);
			});

			const cmdUpdate = makePrivateCommandUpdate(700, "help");
			await instance.bot.handleUpdate(cmdUpdate);

			expect(captured).toHaveLength(1);
			expect(captured[0].payload.text).toContain("remember");

			captured.length = 0;

			const textUpdate = makePrivateTextUpdate(701, "Hello there");
			await instance.bot.handleUpdate(textUpdate);

			expect(captured).toHaveLength(1);
			expect(captured[0].payload.text).toBe(FALLBACK_RESPONSE);
		});
	});

	describe("EC3: route handler throws — pipeline returns fallback response", () => {
		it("returns fallback response when the routed handler throws", async () => {
			harness.classification.setNextIntent("memory.save");
			harness.recording.setThrowOnRoute("memory");

			const update = makePrivateTextUpdate(800, "Remember that I like cats");
			await harness.instance.bot.handleUpdate(update);

			expect(harness.captured).toHaveLength(1);
			expect(harness.captured[0].payload.text).toBe(FALLBACK_RESPONSE);
		});
	});

	describe("EC5: sequential message processing per user preserved", () => {
		it("routes two sequential messages from the same user correctly", async () => {
			harness.classification.setNextIntent("memory.save");

			const update1 = makePrivateTextUpdate(900, "First message", { userId: 42 });
			await harness.instance.bot.handleUpdate(update1);

			harness.classification.setNextIntent("reminder.create");
			const update2 = makePrivateTextUpdate(901, "Second message", { userId: 42 });
			await harness.instance.bot.handleUpdate(update2);

			expect(harness.recording.dispatched).toHaveLength(2);
			expect(harness.recording.dispatched[0].routeKey).toBe("memory");
			expect(harness.recording.dispatched[1].routeKey).toBe("reminder");
		});
	});

	describe("AC8: routing matrix completeness", () => {
		it("resolveRoute covers every intent in the taxonomy", () => {
			for (const intent of VALID_INTENTS) {
				const route = resolveRoute(intent);
				expect(["chat", "memory", "reminder", "system"]).toContain(route);
			}
		});

		it("resolveRoute returns unknown for undefined", () => {
			expect(resolveRoute(undefined)).toBe("unknown");
		});
	});
});

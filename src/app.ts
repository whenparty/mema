import { Elysia } from "elysia";
import { createTelegramBot } from "./gateway/telegram/bot";
import type { MessageHandler } from "./gateway/telegram/types";
import { createDbClient } from "./infra/db/client";
import { runMigrations } from "./infra/db/migrate";
import { createDuplicateChecker } from "./infra/db/queries/check-duplicate-update";
import { createDialogStateStore } from "./infra/db/queries/dialog-state-store";
import { createResolveTelegramUserId } from "./infra/db/queries/resolve-telegram-user-id";
import { createPromptLoader } from "./infra/llm/prompt-loader";
import { getProviderForModel } from "./infra/llm/provider-factory";
import { createTokenTracker } from "./infra/llm/token-tracker";
import { createDialogStateHandlers } from "./pipeline/dialog-state-handlers";
import { createDialogStateManager } from "./pipeline/dialog-state-manager";
import { createDialogStateTimeoutScheduler } from "./pipeline/dialog-state-timeout-scheduler";
import type {
	DialogStateCompletionCallbacks,
	DialogStateNotifier,
} from "./pipeline/dialog-state-types";
import { createPipeline } from "./pipeline/orchestrator";
import { createRateLimiter } from "./pipeline/rate-limiter";
import { createRouteStep } from "./pipeline/router";
import { createDialogStateClassificationRuntime } from "./pipeline/steps/classify-intent-and-complexity";
import { createDialogStateGateStep } from "./pipeline/steps/dialog-state-gate";
import { createGenerateResponseStep } from "./pipeline/steps/generate-response";
import { createRateLimitStep } from "./pipeline/steps/rate-limit-check";
import { createStubRouteHandlers, createStubSteps } from "./pipeline/steps/stubs";
import { createTokenQuotaStep } from "./pipeline/steps/token-quota-check";
import { getLlmModels, initEnv } from "./shared/env";
import { createRequestLoggingMiddleware, logger } from "./shared/logger";
import type { MessageInput } from "./shared/types";

export const app = new Elysia()
	.use(createRequestLoggingMiddleware())
	.get("/health", () => ({ status: "ok" as const }));

if (import.meta.main) {
	const env = initEnv();
	logger.level = env.logLevel;

	logger.info("Running database migrations");
	await runMigrations(env.databaseUrl);
	logger.info("Migrations complete");

	const db = createDbClient(env.databaseUrl);
	const promptLoader = createPromptLoader({
		promptsDir: new URL("../prompts", import.meta.url).pathname,
		nodeEnv: env.nodeEnv,
	});
	const compactModel = getLlmModels().compact;
	const compactProvider = getProviderForModel(compactModel, env);

	const routeHandlers = createStubRouteHandlers();
	const store = createDialogStateStore(db);
	const handlers = createDialogStateHandlers();
	const scheduler = createDialogStateTimeoutScheduler();

	const completionCallbacks: DialogStateCompletionCallbacks = {
		conflict: async (_args) => {
			throw new Error("TASK-5.4 must implement conflict completion");
		},
		delete: async (_args) => {
			throw new Error("TASK-7.4/TASK-7.5 must implement delete completion");
		},
		account_delete: async (_args) => {
			throw new Error("TASK-7.6 must implement account-delete completion");
		},
		interest: async (_args) => {
			throw new Error("TASK-13.2/TASK-13.4 must implement interest completion");
		},
		missing_data: async (_args) => {
			throw new Error("Future reminder/chat tasks must implement missing-data completion");
		},
		entity_disambiguation: async (_args) => {
			throw new Error("TASK-5.3 must implement entity-disambiguation completion");
		},
	};

	const classifier = createDialogStateClassificationRuntime({
		async classifyMessage(messages, options) {
			return compactProvider.chat(messages, {
				model: compactModel,
				reasoningEffort: "low",
				maxTokens: options.maxTokens,
				jsonSchema: options.jsonSchema,
			});
		},
		renderPrompt(templateName, variables) {
			return promptLoader.render(templateName, variables);
		},
	});

	let telegramBot: ReturnType<typeof createTelegramBot> | null = null;
	const notifier: DialogStateNotifier = {
		async sendTimeoutReset(externalUserId, text) {
			if (!telegramBot) {
				throw new Error("Telegram bot is not initialized");
			}

			const chatId = Number(externalUserId);
			if (!Number.isFinite(chatId)) {
				throw new Error(`Invalid Telegram user id "${externalUserId}"`);
			}

			await telegramBot.bot.api.sendMessage(chatId, text);
		},
	};

	const manager = createDialogStateManager({
		store,
		handlers,
		completions: completionCallbacks,
		classifier,
		scheduler,
		notifier,
	});
	const gateStep = createDialogStateGateStep({ manager });
	const rateLimiter = createRateLimiter({ maxMessages: 100, windowMs: 3_600_000 });

	const tokenTracker = createTokenTracker({ db, defaultQuotaLimit: env.tokenQuotaMonthly });
	const resolveUserId = createResolveTelegramUserId(db);
	const notifyQuotaAdmin = async (message: string): Promise<void> => {
		if (!telegramBot) {
			logger.warn({ event: "admin_notification_skipped" }, "telegram bot not initialized");
			return;
		}
		const chatId = Number(env.adminUserId);
		if (!Number.isFinite(chatId)) {
			logger.warn({ event: "admin_notification_skipped" }, "invalid ADMIN_USER_ID");
			return;
		}
		await telegramBot.bot.api.sendMessage(chatId, message);
	};

	const powerfulAModel = getLlmModels().powerfulA;
	const powerfulAProvider = getProviderForModel(powerfulAModel, env);
	const generateResponseStep = createGenerateResponseStep({
		async generateChat(messages, options) {
			return powerfulAProvider.chat(messages, {
				model: powerfulAModel,
				maxTokens: options.maxTokens,
			});
		},
		renderPrompt(templateName, variables) {
			return promptLoader.render(templateName, variables);
		},
	});

	const steps = createStubSteps({
		dialogStateGate: gateStep,
		rateLimitCheck: createRateLimitStep({ limiter: rateLimiter }),
		tokenQuotaCheck: createTokenQuotaStep({
			resolveUserId,
			checkQuota: tokenTracker.checkQuota,
			notifyAdmin: notifyQuotaAdmin,
		}),
		routeIntent: createRouteStep(routeHandlers),
		generateResponse: generateResponseStep,
	});
	const pipeline = createPipeline(steps);

	const onMessage: MessageHandler = async (input) => {
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

	telegramBot = createTelegramBot({
		token: env.telegramBotToken,
		onMessage,
		isDuplicate: createDuplicateChecker(db),
	});

	app.listen(env.port);
	logger.info({ port: env.port }, "Server started");

	await telegramBot.start();

	// Graceful shutdown
	const shutdown = async () => {
		logger.info("Shutting down...");
		await telegramBot.stop();
		app.stop();
		logger.info("Shutdown complete");
		process.exit(0);
	};

	process.on("SIGINT", () => {
		shutdown().catch((err: unknown) => {
			logger.error(err, "error during shutdown");
			process.exit(1);
		});
	});

	process.on("SIGTERM", () => {
		shutdown().catch((err: unknown) => {
			logger.error(err, "error during shutdown");
			process.exit(1);
		});
	});
}

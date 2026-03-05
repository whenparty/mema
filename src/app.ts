import { Elysia } from "elysia";
import { createTelegramBot } from "./gateway/telegram/bot";
import { createDefaultCommandHandlers } from "./gateway/telegram/commands/handlers";
import type { MessageHandler } from "./gateway/telegram/types";
import { createDbClient } from "./infra/db/client";
import { runMigrations } from "./infra/db/migrate";
import { createDuplicateChecker } from "./infra/db/queries/check-duplicate-update";
import { createPipeline } from "./pipeline/orchestrator";
import { createRouteStep } from "./pipeline/router";
import { createRouteHandlers } from "./pipeline/steps/route-handlers";
import { createStubSteps } from "./pipeline/steps/stubs";
import { initEnv } from "./shared/env";
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

	const noOpHandler = async () => {};
	const routeHandlers = createRouteHandlers({
		onChat: noOpHandler,
		onMemory: noOpHandler,
		onReminder: noOpHandler,
		onSystem: noOpHandler,
	});
	const steps = createStubSteps({ routeIntent: createRouteStep(routeHandlers) });
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

	const commandHandlers = createDefaultCommandHandlers();
	const telegramBot = createTelegramBot({
		token: env.telegramBotToken,
		onMessage,
		isDuplicate: createDuplicateChecker(db),
		commandHandlers,
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

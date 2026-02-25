import { Elysia } from "elysia";
import { createTelegramBot } from "./gateway/telegram/bot";
import type { MessageHandler } from "./gateway/telegram/types";
import { createDbClient } from "./infra/db/client";
import { runMigrations } from "./infra/db/migrate";
import { createDuplicateChecker } from "./infra/db/queries/check-duplicate-update";
import { initEnv } from "./shared/env";
import { createRequestLoggingMiddleware, logger } from "./shared/logger";

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

	// Stub message handler — pipeline integration comes in later tasks
	const onMessage: MessageHandler = async (input) => {
		logger.debug({ telegramUserId: input.telegramUserId }, "message received");
		return "I received your message. Pipeline not yet implemented.";
	};

	const telegramBot = createTelegramBot({
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

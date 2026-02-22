import { Elysia } from "elysia";
import { runMigrations } from "./infra/db/migrate";
import { createRequestLoggingMiddleware, logger } from "./shared/logger";

const DEFAULT_PORT = 3000;

export const app = new Elysia()
	.use(createRequestLoggingMiddleware())
	.get("/health", () => ({ status: "ok" as const }));

if (import.meta.main) {
	const databaseUrl = process.env.DATABASE_URL;
	if (databaseUrl) {
		logger.info("Running database migrations");
		await runMigrations(databaseUrl);
		logger.info("Migrations complete");
	}

	app.listen(DEFAULT_PORT);
	logger.info({ port: DEFAULT_PORT }, "Server started");
}

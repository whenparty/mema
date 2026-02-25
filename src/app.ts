import { Elysia } from "elysia";
import { runMigrations } from "./infra/db/migrate";
import { initEnv } from "./shared/env";
import { createRequestLoggingMiddleware, logger } from "./shared/logger";

export const app = new Elysia()
	.use(createRequestLoggingMiddleware())
	.get("/health", () => ({ status: "ok" as const }));

if (import.meta.main) {
	const env = initEnv();

	logger.info("Running database migrations");
	await runMigrations(env.databaseUrl);
	logger.info("Migrations complete");

	app.listen(env.port);
	logger.info({ port: env.port }, "Server started");
}

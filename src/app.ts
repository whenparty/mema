import { Elysia } from "elysia";
import { runMigrations } from "./infra/db/migrate";

const DEFAULT_PORT = 3000;

export const app = new Elysia().get("/health", () => ({ status: "ok" as const }));

if (import.meta.main) {
	const databaseUrl = process.env.DATABASE_URL;
	if (databaseUrl) {
		console.log("Running database migrations...");
		await runMigrations(databaseUrl);
		console.log("Migrations complete.");
	}

	app.listen(DEFAULT_PORT);
	console.log(`Server running on port ${DEFAULT_PORT}`);
}

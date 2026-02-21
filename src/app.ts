import { Elysia } from "elysia";

const DEFAULT_PORT = 3000;

export const app = new Elysia().get("/health", () => ({ status: "ok" as const }));

if (import.meta.main) {
	app.listen(DEFAULT_PORT);
	console.log(`Server running on port ${DEFAULT_PORT}`);
}

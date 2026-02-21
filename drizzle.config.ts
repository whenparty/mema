import { defineConfig } from "drizzle-kit";

export const config = defineConfig({
	dialect: "postgresql",
	schema: "./src/infra/db/schema.ts",
	out: "./drizzle",
	dbCredentials: {
		url: process.env.DATABASE_URL ?? "",
	},
});

// Default export required by drizzle-kit CLI
export default config;

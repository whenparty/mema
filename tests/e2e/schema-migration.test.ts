import { createDbClient } from "@/infra/db/client";
import type { DbClient } from "@/infra/db/client";
import * as schema from "@/infra/db/schema";
import { sql as drizzleSql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const DATABASE_URL = process.env.DATABASE_URL ?? "postgresql://mema:password@localhost:5432/mema";

const EXPECTED_TABLES = [
	"users",
	"user_auths",
	"entities",
	"fact_entities",
	"facts",
	"reminders",
	"messages",
	"dialog_states",
	"evaluations",
	"interest_scans",
	"interest_candidates",
	"token_usages",
] as const;

describe("E2E: Schema Migration", () => {
	let connection: ReturnType<typeof postgres>;
	let dbClient: DbClient;

	beforeAll(async () => {
		connection = postgres(DATABASE_URL, { max: 1 });
		await connection.unsafe("CREATE EXTENSION IF NOT EXISTS vector;");

		const db = drizzle(connection);
		await migrate(db, { migrationsFolder: "./drizzle" });

		dbClient = createDbClient(DATABASE_URL);
	}, 30_000);

	afterAll(async () => {
		if (connection) {
			await connection.end();
		}
	});

	it("creates all 12 expected tables", async () => {
		const result = await connection`
			SELECT table_name
			FROM information_schema.tables
			WHERE table_schema = 'public'
			  AND table_type = 'BASE TABLE'
			ORDER BY table_name
		`;

		const tableNames = result.map((row) => String(row.table_name));

		for (const expected of EXPECTED_TABLES) {
			expect(tableNames).toContain(expected);
		}
	});

	it("facts table has a vector(1536) embedding column", async () => {
		const result = await connection`
			SELECT column_name, udt_name
			FROM information_schema.columns
			WHERE table_schema = 'public'
			  AND table_name = 'facts'
			  AND column_name = 'embedding'
		`;

		expect(result).toHaveLength(1);
		expect(result[0].udt_name).toBe("vector");
	});

	it("schema barrel export provides all table objects", () => {
		expect(schema.users).toBeDefined();
		expect(schema.userAuths).toBeDefined();
		expect(schema.entities).toBeDefined();
		expect(schema.factEntities).toBeDefined();
		expect(schema.facts).toBeDefined();
		expect(schema.reminders).toBeDefined();
		expect(schema.messages).toBeDefined();
		expect(schema.dialogStates).toBeDefined();
		expect(schema.evaluations).toBeDefined();
		expect(schema.interestScans).toBeDefined();
		expect(schema.interestCandidates).toBeDefined();
		expect(schema.tokenUsages).toBeDefined();
	});

	it("createDbClient connects and can run a simple query", async () => {
		const result = await dbClient.execute(drizzleSql`SELECT 1 AS value`);
		expect(result).toBeDefined();
	});

	it("pgvector extension is enabled", async () => {
		const result = await connection`
			SELECT extname
			FROM pg_extension
			WHERE extname = 'vector'
		`;

		expect(result).toHaveLength(1);
		expect(result[0].extname).toBe("vector");
	});
});

import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";

export async function runMigrations(connectionUrl: string): Promise<void> {
	const connection = postgres(connectionUrl, { max: 1 });
	const db = drizzle(connection);

	await connection.unsafe("CREATE EXTENSION IF NOT EXISTS vector;");
	await migrate(db, { migrationsFolder: "./drizzle" });

	await connection.end();
}

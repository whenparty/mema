import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

export function createDbClient(connectionUrl: string) {
	const connection = postgres(connectionUrl);
	return drizzle(connection, { schema });
}

export type DbClient = ReturnType<typeof createDbClient>;

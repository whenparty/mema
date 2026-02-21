import { createDbClient } from "@/infra/db/client";
import { describe, expect, it } from "vitest";

describe("createDbClient", () => {
	it("is exported as a function", () => {
		expect(typeof createDbClient).toBe("function");
	});

	it("returns a drizzle instance with query property", () => {
		const client = createDbClient("postgres://localhost:5432/test");
		expect(client).toBeDefined();
		expect(client.query).toBeDefined();
	});
});

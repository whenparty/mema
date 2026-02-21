import { describe, expect, it } from "vitest";
import { config } from "../../../../drizzle.config";

describe("drizzle config", () => {
	it("uses postgresql dialect", () => {
		expect(config.dialect).toBe("postgresql");
	});

	it("points schema to ./src/infra/db/schema.ts", () => {
		expect(config.schema).toBe("./src/infra/db/schema.ts");
	});

	it("outputs migrations to ./drizzle", () => {
		expect(config.out).toBe("./drizzle");
	});
});

import { runMigrations } from "@/infra/db/migrate";
import { describe, expect, it } from "vitest";

describe("runMigrations", () => {
	it("is exported as a function", () => {
		expect(typeof runMigrations).toBe("function");
	});
});

import { describe, expect, it } from "vitest";
import { app } from "./app";

describe("Health endpoint", () => {
	it("GET /health returns 200 with status ok", async () => {
		const response = await app.handle(new Request("http://localhost/health"));

		expect(response.status).toBe(200);

		const body = await response.json();
		expect(body).toEqual({ status: "ok" });
	});
});

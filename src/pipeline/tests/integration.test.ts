import type { MessageInput } from "@/shared/types";
import { describe, expect, it } from "vitest";
import { FALLBACK_RESPONSE, createPipeline } from "../orchestrator";
import { createRouteStep } from "../router";
import { createStubRouteHandlers, createStubSteps } from "../steps/stubs";
import { type PipelineSteps, STEP_ORDER } from "../types";

const TEST_INPUT: MessageInput = {
	text: "Remember that I like coffee",
	externalUserId: "user-456",
	username: "integrationuser",
	firstName: "Integration",
	languageCode: "en",
	platformMessageId: 99,
};

describe("pipeline integration", () => {
	it("returns a response for valid input with full stub pipeline", async () => {
		const routeHandlers = createStubRouteHandlers();
		const steps = createStubSteps({ routeIntent: createRouteStep(routeHandlers) });
		const pipeline = createPipeline(steps);

		const result = await pipeline(TEST_INPUT);

		expect(result).toBe("I received your message. Pipeline not yet implemented.");
	});

	it("returns early response when statusCheck sets earlyResponse", async () => {
		const routeHandlers = createStubRouteHandlers();
		const steps = createStubSteps({
			routeIntent: createRouteStep(routeHandlers),
			statusCheck: async (ctx) => {
				ctx.earlyResponse = "Account is paused.";
			},
		});
		const pipeline = createPipeline(steps);

		const result = await pipeline(TEST_INPUT);

		expect(result).toBe("Account is paused.");
	});

	it("returns fallback response when a step throws", async () => {
		const routeHandlers = createStubRouteHandlers();
		const steps = createStubSteps({
			routeIntent: createRouteStep(routeHandlers),
			extractFacts: async () => {
				throw new Error("LLM timeout");
			},
		});
		const pipeline = createPipeline(steps);

		const result = await pipeline(TEST_INPUT);

		expect(result).toBe(FALLBACK_RESPONSE);
	});

	it("createStubSteps has all keys from STEP_ORDER", () => {
		const steps = createStubSteps();
		const stepKeys = STEP_ORDER.map((entry) => entry.key);

		for (const key of stepKeys) {
			expect(steps).toHaveProperty(key);
			expect(typeof steps[key as keyof PipelineSteps]).toBe("function");
		}
	});
});

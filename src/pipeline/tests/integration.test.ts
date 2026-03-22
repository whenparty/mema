import type { MessageInput } from "@/shared/types";
import { describe, expect, it, vi } from "vitest";
import { FALLBACK_RESPONSE, createPipeline } from "../orchestrator";
import { createRouteStep } from "../router";
import { createStubRouteHandlers, createStubSteps } from "../steps/stubs";
import type { PipelineContext, PipelineStep } from "../types";
import { type PipelineSteps, STEP_ORDER } from "../types";

const TEST_INPUT: MessageInput = {
	text: "Remember that I like coffee",
	externalUserId: "user-456",
	username: "integrationuser",
	firstName: "Integration",
	languageCode: "en",
	platformUpdateId: 99,
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

	describe("dialog_state_gate integration", () => {
		it("active-state early exit from dialogStateGate skips idle classification and routeIntent", async () => {
			const callOrder: string[] = [];

			const dialogStateGate: PipelineStep = async (ctx) => {
				callOrder.push("dialogStateGate");
				ctx.earlyResponse = "Conflict resolved.";
			};
			const classifyStep: PipelineStep = async () => {
				callOrder.push("classifyIntentAndComplexity");
			};
			const routeStep: PipelineStep = async () => {
				callOrder.push("routeIntent");
			};
			const updateStatus: PipelineStep = async () => {
				callOrder.push("updateProcessingStatus");
			};

			const steps = createStubSteps({
				dialogStateGate,
				classifyIntentAndComplexity: classifyStep,
				routeIntent: routeStep,
				updateProcessingStatus: updateStatus,
			});
			const pipeline = createPipeline(steps);

			const result = await pipeline(TEST_INPUT);

			expect(result).toBe("Conflict resolved.");
			expect(callOrder).toContain("dialogStateGate");
			expect(callOrder).not.toContain("classifyIntentAndComplexity");
			expect(callOrder).not.toContain("routeIntent");
			expect(callOrder).toContain("updateProcessingStatus");
		});

		it("no active state falls through unchanged to existing idle stub path", async () => {
			const callOrder: string[] = [];

			const dialogStateGate: PipelineStep = async () => {
				callOrder.push("dialogStateGate");
			};
			const classifyStep: PipelineStep = async (ctx) => {
				callOrder.push("classifyIntentAndComplexity");
				ctx.intent = "chat";
				ctx.complexity = "trivial";
			};
			const routeStep: PipelineStep = async () => {
				callOrder.push("routeIntent");
			};
			const generateStep: PipelineStep = async (ctx) => {
				callOrder.push("generateResponse");
				ctx.response = "Pipeline response.";
			};

			const steps = createStubSteps({
				dialogStateGate,
				classifyIntentAndComplexity: classifyStep,
				routeIntent: routeStep,
				generateResponse: generateStep,
			});
			const pipeline = createPipeline(steps);

			const result = await pipeline(TEST_INPUT);

			expect(result).toBe("Pipeline response.");
			expect(callOrder).toEqual([
				"dialogStateGate",
				"classifyIntentAndComplexity",
				"routeIntent",
				"generateResponse",
			]);
		});

		it("updateProcessingStatus still runs when dialogStateGate throws", async () => {
			const updateSpy = vi.fn();

			const dialogStateGate: PipelineStep = async () => {
				throw new Error("manager error");
			};
			const updateStatus: PipelineStep = async () => {
				updateSpy();
			};

			const steps = createStubSteps({
				dialogStateGate,
				updateProcessingStatus: updateStatus,
			});
			const pipeline = createPipeline(steps);

			const result = await pipeline(TEST_INPUT);

			expect(result).toBe(FALLBACK_RESPONSE);
			expect(updateSpy).toHaveBeenCalledOnce();
		});

		it("dialog_state_gate runs after save_message_received and before extract_facts", async () => {
			const callOrder: string[] = [];

			const save: PipelineStep = async () => {
				callOrder.push("saveMessageReceived");
			};
			const gate: PipelineStep = async () => {
				callOrder.push("dialogStateGate");
			};
			const extract: PipelineStep = async () => {
				callOrder.push("extractFacts");
			};

			const steps = createStubSteps({
				saveMessageReceived: save,
				dialogStateGate: gate,
				extractFacts: extract,
			});
			const pipeline = createPipeline(steps);

			await pipeline(TEST_INPUT);

			const saveIdx = callOrder.indexOf("saveMessageReceived");
			const gateIdx = callOrder.indexOf("dialogStateGate");
			const extractIdx = callOrder.indexOf("extractFacts");

			expect(saveIdx).toBeLessThan(gateIdx);
			expect(gateIdx).toBeLessThan(extractIdx);
		});
	});
});

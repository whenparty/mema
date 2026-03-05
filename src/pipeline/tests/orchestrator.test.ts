import type { MessageInput } from "@/shared/types";
import { describe, expect, it, vi } from "vitest";
import { FALLBACK_RESPONSE, createPipeline } from "../orchestrator";
import { createStubSteps } from "../steps/stubs";
import { type PipelineContext, type PipelineStep, type PipelineSteps, STEP_ORDER } from "../types";

const { mockError } = vi.hoisted(() => ({
	mockError: vi.fn(),
}));

vi.mock("@/shared/logger", () => ({
	createChildLogger: () => ({
		debug: vi.fn(),
		info: vi.fn(),
		warn: vi.fn(),
		error: mockError,
		child: vi.fn(),
	}),
}));

const TEST_INPUT: MessageInput = {
	text: "Hello there",
	externalUserId: "user-123",
	username: "testuser",
	firstName: "Test",
	languageCode: "en",
	platformUpdateId: 42,
};

function createSpySteps(): { steps: PipelineSteps; callOrder: string[] } {
	const callOrder: string[] = [];

	const spyStep = (name: string): PipelineStep => {
		return async () => {
			callOrder.push(name);
		};
	};

	const steps: PipelineSteps = {
		statusCheck: spyStep("statusCheck"),
		rateLimitCheck: spyStep("rateLimitCheck"),
		tokenQuotaCheck: spyStep("tokenQuotaCheck"),
		saveMessageReceived: spyStep("saveMessageReceived"),
		extractFacts: spyStep("extractFacts"),
		resolveEntities: spyStep("resolveEntities"),
		detectConflicts: spyStep("detectConflicts"),
		storeFacts: spyStep("storeFacts"),
		classifyIntentAndComplexity: spyStep("classifyIntentAndComplexity"),
		evaluateDialogState: spyStep("evaluateDialogState"),
		routeIntent: spyStep("routeIntent"),
		buildContext: spyStep("buildContext"),
		generateResponse: spyStep("generateResponse"),
		updateProcessingStatus: spyStep("updateProcessingStatus"),
	};

	return { steps, callOrder };
}

describe("createPipeline", () => {
	it("executes all 14 steps in canonical order", async () => {
		const { steps, callOrder } = createSpySteps();
		const pipeline = createPipeline(steps);

		await pipeline(TEST_INPUT);

		const expectedOrder = STEP_ORDER.map((entry) => entry.key);
		expect(callOrder).toEqual(expectedOrder);
	});

	it("passes same PipelineContext to all steps", async () => {
		const contexts: PipelineContext[] = [];
		const captureStep: PipelineStep = async (ctx) => {
			contexts.push(ctx);
		};

		const steps = createStubSteps({
			statusCheck: captureStep,
			extractFacts: captureStep,
			generateResponse: captureStep,
			updateProcessingStatus: captureStep,
		});

		const pipeline = createPipeline(steps);
		await pipeline(TEST_INPUT);

		expect(contexts.length).toBe(4);
		for (const ctx of contexts) {
			expect(ctx).toBe(contexts[0]);
		}
	});

	it("returns ctx.response on success", async () => {
		const steps = createStubSteps({
			generateResponse: async (ctx) => {
				ctx.response = "Hello from pipeline!";
			},
		});
		const pipeline = createPipeline(steps);

		const result = await pipeline(TEST_INPUT);

		expect(result).toBe("Hello from pipeline!");
	});

	it("returns FALLBACK_RESPONSE when ctx.response is not set", async () => {
		const steps = createStubSteps({
			generateResponse: async () => {},
		});
		const pipeline = createPipeline(steps);

		const result = await pipeline(TEST_INPUT);

		expect(result).toBe(FALLBACK_RESPONSE);
	});

	it("returns FALLBACK_RESPONSE on unhandled error", async () => {
		const steps = createStubSteps({
			extractFacts: async () => {
				throw new Error("extraction failed");
			},
		});
		const pipeline = createPipeline(steps);

		const result = await pipeline(TEST_INPUT);

		expect(result).toBe(FALLBACK_RESPONSE);
	});

	it("logs error with metadata on failure, not message text", async () => {
		mockError.mockClear();

		const userText = TEST_INPUT.text;
		const steps = createStubSteps({
			extractFacts: async () => {
				throw new Error(`Failed to process: ${userText}`);
			},
		});
		const pipeline = createPipeline(steps);

		await pipeline(TEST_INPUT);

		expect(mockError).toHaveBeenCalled();
		const firstCall = mockError.mock.calls[0];
		const loggedMetadata = firstCall[0] as Record<string, unknown>;
		expect(loggedMetadata).not.toHaveProperty("text");
		expect(loggedMetadata).toHaveProperty("error");

		// error field must be the error name/type, never the message
		expect(loggedMetadata.error).toBe("Error");

		// Verify no logged value contains user message text
		const loggedValues = Object.values(loggedMetadata);
		for (const value of loggedValues) {
			expect(String(value)).not.toContain(userText);
		}
	});

	it("runs update_processing_status after step failure", async () => {
		const updateSpy = vi.fn();
		const steps = createStubSteps({
			extractFacts: async () => {
				throw new Error("extraction failed");
			},
			updateProcessingStatus: async () => {
				updateSpy();
			},
		});
		const pipeline = createPipeline(steps);

		await pipeline(TEST_INPUT);

		expect(updateSpy).toHaveBeenCalledOnce();
	});

	it("calls update_processing_status even when a step fails", async () => {
		const callOrder: string[] = [];
		const steps = createStubSteps({
			saveMessageReceived: async () => {
				throw new Error("save failed");
			},
			updateProcessingStatus: async () => {
				callOrder.push("updateProcessingStatus");
			},
		});
		const pipeline = createPipeline(steps);

		await pipeline(TEST_INPUT);

		expect(callOrder).toContain("updateProcessingStatus");
	});

	it("handles update_processing_status error gracefully", async () => {
		const steps = createStubSteps({
			extractFacts: async () => {
				throw new Error("extraction failed");
			},
			updateProcessingStatus: async () => {
				throw new Error("status update failed");
			},
		});
		const pipeline = createPipeline(steps);

		const result = await pipeline(TEST_INPUT);

		expect(result).toBe(FALLBACK_RESPONSE);
	});

	it("does not log error message text from update_processing_status failure", async () => {
		mockError.mockClear();

		const userText = TEST_INPUT.text;
		const steps = createStubSteps({
			updateProcessingStatus: async () => {
				throw new Error(`Status update failed for: ${userText}`);
			},
		});
		const pipeline = createPipeline(steps);

		await pipeline(TEST_INPUT);

		// Find the log call for "failed to update processing status"
		const statusErrorCall = mockError.mock.calls.find(
			(call) => call[1] === "failed to update processing status",
		);
		expect(statusErrorCall).toBeDefined();

		const loggedMetadata = statusErrorCall?.[0] as Record<string, unknown>;
		expect(loggedMetadata.error).toBe("Error");

		const loggedValues = Object.values(loggedMetadata);
		for (const value of loggedValues) {
			expect(String(value)).not.toContain(userText);
		}
	});

	it("returns earlyResponse when set by a step", async () => {
		const steps = createStubSteps({
			statusCheck: async (ctx) => {
				ctx.earlyResponse = "Bot is paused.";
			},
		});
		const pipeline = createPipeline(steps);

		const result = await pipeline(TEST_INPUT);

		expect(result).toBe("Bot is paused.");
	});

	it("skips remaining steps but still runs update_processing_status on early exit", async () => {
		const callOrder: string[] = [];
		const steps = createStubSteps({
			statusCheck: async (ctx) => {
				callOrder.push("statusCheck");
				ctx.earlyResponse = "Bot is paused.";
			},
			extractFacts: async () => {
				callOrder.push("extractFacts");
			},
			generateResponse: async () => {
				callOrder.push("generateResponse");
			},
			updateProcessingStatus: async () => {
				callOrder.push("updateProcessingStatus");
			},
		});
		const pipeline = createPipeline(steps);

		await pipeline(TEST_INPUT);

		expect(callOrder).toEqual(["statusCheck", "updateProcessingStatus"]);
	});

	it("records stepTimings for each executed step", async () => {
		let capturedCtx: PipelineContext | undefined;
		const steps = createStubSteps({
			updateProcessingStatus: async (ctx) => {
				capturedCtx = ctx;
			},
		});
		const pipeline = createPipeline(steps);

		await pipeline(TEST_INPUT);

		expect(capturedCtx).toBeDefined();
		const timings = capturedCtx?.stepTimings;
		expect(timings).toBeDefined();

		// All steps except update_processing_status should have timings recorded
		// before updateProcessingStatus runs. After it runs, it also gets a timing.
		for (const { name } of STEP_ORDER) {
			if (name === "update_processing_status") continue;
			expect(timings).toHaveProperty(name);
			expect(typeof timings?.[name]).toBe("number");
		}
	});

	it("sets ctx.error on failure so updateProcessingStatus can inspect it", async () => {
		let capturedError: unknown;
		const steps = createStubSteps({
			extractFacts: async () => {
				throw new Error("extraction failed");
			},
			updateProcessingStatus: async (ctx) => {
				capturedError = ctx.error;
			},
		});
		const pipeline = createPipeline(steps);

		await pipeline(TEST_INPUT);

		expect(capturedError).toBeInstanceOf(Error);
		expect((capturedError as Error).message).toBe("extraction failed");
	});
});

import type { PipelineStep, PipelineSteps, RouteHandlers } from "../types";

const noOp: PipelineStep = async () => {};

export function createStubRouteHandlers(): RouteHandlers {
	return {
		chat: noOp,
		memory: noOp,
		reminder: noOp,
		system: noOp,
	};
}

export function createStubSteps(overrides?: Partial<PipelineSteps>): PipelineSteps {
	const defaults: PipelineSteps = {
		statusCheck: noOp,
		rateLimitCheck: noOp,
		tokenQuotaCheck: noOp,
		saveMessageReceived: noOp,
		extractFacts: noOp,
		resolveEntities: noOp,
		detectConflicts: noOp,
		storeFacts: noOp,
		classifyIntentAndComplexity: async (ctx) => {
			ctx.intent = "chat";
			ctx.complexity = "trivial";
		},
		routeIntent: noOp,
		buildContext: noOp,
		generateResponse: async (ctx) => {
			ctx.response = "I received your message. Pipeline not yet implemented.";
		},
		updateProcessingStatus: noOp,
	};
	return { ...defaults, ...overrides };
}

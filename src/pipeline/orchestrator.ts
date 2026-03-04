import { createChildLogger } from "@/shared/logger";
import type { MessageInput } from "@/shared/types";
import { type PipelineContext, type PipelineSteps, STEP_ORDER } from "./types";

export const FALLBACK_RESPONSE = "Something went wrong. Please try again later.";

export function createPipeline(steps: PipelineSteps): (input: MessageInput) => Promise<string> {
	const log = createChildLogger({ module: "pipeline" });

	return async (input: MessageInput): Promise<string> => {
		const ctx: PipelineContext = { input, stepTimings: {} };

		try {
			for (const { name, key } of STEP_ORDER) {
				if (name === "update_processing_status") continue;

				const start = performance.now();
				await steps[key](ctx, log);
				ctx.stepTimings[name] = Math.round(performance.now() - start);

				log.debug({ step: name, durationMs: ctx.stepTimings[name] }, "step completed");

				if (ctx.earlyResponse !== undefined) {
					log.info({ step: name, userId: ctx.userId }, "early exit");
					break;
				}
			}
		} catch (error: unknown) {
			ctx.error = error;
			log.error(
				{
					userId: ctx.userId,
					messageId: ctx.messageId,
					error: error instanceof Error ? error.name : "UnknownError",
				},
				"pipeline failed",
			);
		}

		// update_processing_status always runs
		try {
			const start = performance.now();
			await steps.updateProcessingStatus(ctx, log);
			ctx.stepTimings.update_processing_status = Math.round(performance.now() - start);
		} catch (statusError: unknown) {
			log.error(
				{
					userId: ctx.userId,
					messageId: ctx.messageId,
					error: statusError instanceof Error ? statusError.name : "UnknownError",
				},
				"failed to update processing status",
			);
		}

		if (ctx.earlyResponse !== undefined) return ctx.earlyResponse;
		if (ctx.error !== undefined) return FALLBACK_RESPONSE;
		return ctx.response ?? FALLBACK_RESPONSE;
	};
}

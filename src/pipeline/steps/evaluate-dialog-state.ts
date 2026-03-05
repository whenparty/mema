import type { DialogStateManager } from "@/domain/dialog/state-manager";
import type pino from "pino";
import type { PipelineContext, PipelineStep } from "../types";

export interface EvaluateDialogStateDeps {
	readonly dialogManager: DialogStateManager;
}

export function createEvaluateDialogStateStep(deps: EvaluateDialogStateDeps): PipelineStep {
	return async (ctx: PipelineContext, log: pino.Logger): Promise<void> => {
		if (!ctx.userId) return;

		const decision = await deps.dialogManager.evaluateInbound(
			ctx.userId,
			ctx.intent,
			ctx.input.text,
		);

		ctx.dialogDecision = decision;

		switch (decision.kind) {
			case "continue_dialog":
				ctx.dialogState = decision.state;
				ctx.dialogContext = decision.context;
				log.debug(
					{ userId: ctx.userId, dialogState: decision.state, contextType: decision.context.type },
					"continuing dialog",
				);
				break;

			case "reset_timeout":
				ctx.dialogState = "idle";
				ctx.dialogContext = null;
				log.info(
					{
						userId: ctx.userId,
						previousState: decision.previousState,
						previousContextType: decision.previousContextType,
						resetReason: "timeout",
					},
					"dialog state reset",
				);
				break;

			case "reset_off_topic":
				ctx.dialogState = "idle";
				ctx.dialogContext = null;
				log.info(
					{
						userId: ctx.userId,
						previousState: decision.previousState,
						previousContextType: decision.previousContextType,
						resetReason: "off_topic",
					},
					"dialog state reset",
				);
				break;

			case "idle_noop":
				ctx.dialogState = "idle";
				ctx.dialogContext = null;
				break;

			case "recover_recent_reset":
				ctx.dialogState = "idle";
				ctx.dialogContext = null;
				log.info(
					{
						userId: ctx.userId,
						recoveredContextType: decision.resetContext.type,
						resetReason: decision.resetReason,
					},
					"bare confirmation recovery triggered",
				);
				break;
		}
	};
}

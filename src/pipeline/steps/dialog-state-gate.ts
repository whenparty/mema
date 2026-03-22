import type { DialogStateManager } from "../dialog-state-types";
import type { PipelineStep } from "../types";

export function createDialogStateGateStep(deps: {
	manager: DialogStateManager;
}): PipelineStep {
	return async (ctx, log) => {
		const decision = await deps.manager.evaluateInbound(ctx, log);

		ctx.userId = decision.userId;
		ctx.dialogState = decision.dialogState;
		ctx.recentResetHint = decision.recentResetHint;

		if (decision.action === "reply_and_stop") {
			ctx.earlyResponse = decision.response;
		}
	};
}

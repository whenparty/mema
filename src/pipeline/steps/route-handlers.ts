import type pino from "pino";
import type { PipelineContext, RouteHandler, RouteHandlers } from "../types";

export interface RouteHandlerDeps {
	onChat: RouteHandler;
	onMemory: RouteHandler;
	onReminder: RouteHandler;
	onSystem: RouteHandler;
}

export function createRouteHandlers(deps: RouteHandlerDeps): RouteHandlers {
	const unknownHandler: RouteHandler = async (ctx: PipelineContext, log: pino.Logger) => {
		log.warn(
			{ intent: ctx.intent, userId: ctx.userId, route: "unknown" },
			"unknown intent delegated to chat",
		);
		await deps.onChat(ctx, log);
	};

	return {
		chat: deps.onChat,
		memory: deps.onMemory,
		reminder: deps.onReminder,
		system: deps.onSystem,
		unknown: unknownHandler,
	};
}

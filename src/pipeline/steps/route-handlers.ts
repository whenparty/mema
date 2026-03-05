import type pino from "pino";
import type { PipelineContext, RouteHandler, RouteHandlers } from "../types";

export interface RouteHandlerDeps {
	onChat: RouteHandler;
	onMemory: RouteHandler;
	onReminder: RouteHandler;
	onSystem: RouteHandler;
}

export function createRouteHandlers(deps: RouteHandlerDeps): RouteHandlers {
	const unknownHandler: RouteHandler = async (ctx: PipelineContext, _log: pino.Logger) => {
		await deps.onChat(ctx, _log);
	};

	return {
		chat: deps.onChat,
		memory: deps.onMemory,
		reminder: deps.onReminder,
		system: deps.onSystem,
		unknown: unknownHandler,
	};
}

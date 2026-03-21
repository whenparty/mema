import type { Intent } from "@/shared/types";
import type { PipelineContext, PipelineStep, RouteHandlerKey, RouteHandlers } from "./types";

export function resolveRoute(intent: Intent | undefined): RouteHandlerKey {
	if (intent === undefined) return "chat";
	if (intent === "chat") return "chat";
	if (intent.startsWith("memory.")) return "memory";
	if (intent.startsWith("reminder.")) return "reminder";
	if (intent.startsWith("system.")) return "system";
	return "chat";
}

function dispatchRoute(
	handlers: RouteHandlers,
	routeKey: RouteHandlerKey,
	ctx: PipelineContext,
	log: Parameters<typeof handlers.chat>[1],
): Promise<void> {
	switch (routeKey) {
		case "chat":
			return handlers.chat(ctx, log);
		case "memory":
			return handlers.memory(ctx, log);
		case "reminder":
			return handlers.reminder(ctx, log);
		case "system":
			return handlers.system(ctx, log);
		default: {
			const _exhaustive: never = routeKey;
			throw new Error(`Unhandled route key: ${_exhaustive}`);
		}
	}
}

export function createRouteStep(handlers: RouteHandlers): PipelineStep {
	return async (ctx: PipelineContext, log) => {
		const routeKey = resolveRoute(ctx.intent);
		ctx.routeResult = routeKey;
		log.debug({ intent: ctx.intent, route: routeKey }, "routing intent");
		await dispatchRoute(handlers, routeKey, ctx, log);
	};
}

import type { Intent } from "@/shared/types";
import type { PipelineContext, PipelineStep, RouteHandlerKey, RouteHandlers } from "./types";

export function resolveRoute(intent: Intent | undefined): RouteHandlerKey {
	if (intent === undefined) return "unknown";
	if (intent === "chat") return "chat";
	if (intent.startsWith("memory.")) return "memory";
	if (intent.startsWith("reminder.")) return "reminder";
	if (intent.startsWith("system.")) return "system";
	return "unknown";
}

export function createRouteStep(handlers: RouteHandlers): PipelineStep {
	return async (ctx: PipelineContext, log) => {
		const routeKey = resolveRoute(ctx.intent);
		ctx.routeResult = routeKey;
		log.debug({ intent: ctx.intent, route: routeKey }, "routing intent");
		await handlers[routeKey](ctx, log);
	};
}

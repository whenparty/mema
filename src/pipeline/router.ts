import type { Intent } from "@/shared/types";
import type { PipelineContext, PipelineStep, RouteHandlerKey, RouteHandlers } from "./types";

export function resolveRoute(intent: Intent | undefined): RouteHandlerKey {
	switch (intent) {
		case "chat":
			return "chat";
		case "memory.save":
		case "memory.view":
		case "memory.edit":
		case "memory.delete":
		case "memory.delete_entity":
		case "memory.explain":
			return "memory";
		case "reminder.create":
		case "reminder.list":
		case "reminder.cancel":
		case "reminder.edit":
			return "reminder";
		case "system.delete_account":
		case "system.pause":
		case "system.resume":
			return "system";
		default:
			return "unknown";
	}
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
		case "unknown":
			return handlers.unknown(ctx, log);
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

		if (routeKey === "unknown") {
			log.warn(
				{ intent: ctx.intent, userId: ctx.userId, route: routeKey },
				"unrecognized intent falling back to unknown route",
			);
		} else {
			log.debug({ intent: ctx.intent, route: routeKey }, "routing intent");
		}

		await dispatchRoute(handlers, routeKey, ctx, log);
	};
}

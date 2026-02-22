import { Elysia } from "elysia";
import pino from "pino";

export function createLoggerInstance(level?: string): pino.Logger {
	return pino({
		name: "mema",
		level: level ?? process.env.LOG_LEVEL ?? "info",
		timestamp: pino.stdTimeFunctions.isoTime,
	});
}

export const logger = createLoggerInstance();

export function createChildLogger(bindings: Record<string, unknown>): pino.Logger {
	return logger.child(bindings);
}

export function createRequestLogger(requestId: string): pino.Logger {
	return logger.child({ requestId });
}

interface RequestTiming {
	requestId: string;
	start: number;
}

export function createRequestLoggingMiddleware(customLogger?: pino.Logger) {
	const log = customLogger ?? logger;
	const timings = new Map<Request, RequestTiming>();

	return new Elysia({ name: "request-logging" })
		.onRequest(({ request }) => {
			timings.set(request, {
				requestId: crypto.randomUUID(),
				start: performance.now(),
			});
		})
		.onAfterResponse(({ request, set }) => {
			const timing = timings.get(request);
			if (!timing) {
				log.warn({ method: request.method, url: request.url }, "missing request timing data");
				return;
			}

			timings.delete(request);
			const duration = Math.round(performance.now() - timing.start);
			const url = new URL(request.url);
			log.info(
				{
					requestId: timing.requestId,
					method: request.method,
					path: url.pathname,
					status: set.status ?? 200,
					duration,
				},
				"request completed",
			);
		})
		.as("global");
}

import type { RateLimiter } from "../rate-limiter";
import type { PipelineStep } from "../types";

export const RATE_LIMIT_WARNING =
	"You're sending too many messages 😅 Hold on a bit, I'll be back online soon.";

export function createRateLimitStep(deps: {
	limiter: RateLimiter;
}): PipelineStep {
	return async (ctx, log) => {
		const { externalUserId } = ctx.input;
		const admitted = deps.limiter.tryAdmit(externalUserId);

		if (!admitted) {
			log.warn({ externalUserId, event: "rate_limit_exceeded" }, "rate limit exceeded");
			ctx.earlyResponse = RATE_LIMIT_WARNING;
		}
	};
}

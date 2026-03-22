export interface RateLimiterConfig {
	maxMessages: number;
	windowMs: number;
}

export interface RateLimiterDeps {
	nowFn?: () => number;
}

export interface RateLimiter {
	tryAdmit(externalUserId: string): boolean;
	getRemainingCapacity(externalUserId: string): number;
}

export function createRateLimiter(config: RateLimiterConfig, deps?: RateLimiterDeps): RateLimiter {
	const nowFn = deps?.nowFn ?? Date.now;
	const windows = new Map<string, number[]>();

	function getValidTimestamps(externalUserId: string, now: number): number[] {
		const cutoff = now - config.windowMs;
		const timestamps = windows.get(externalUserId);
		if (!timestamps) return [];
		return timestamps.filter((t) => t > cutoff);
	}

	return {
		tryAdmit(externalUserId: string): boolean {
			const now = nowFn();
			const valid = getValidTimestamps(externalUserId, now);

			if (valid.length >= config.maxMessages) {
				windows.set(externalUserId, valid);
				return false;
			}

			if (valid.length === 0) {
				windows.delete(externalUserId);
			}

			valid.push(now);
			windows.set(externalUserId, valid);
			return true;
		},

		getRemainingCapacity(externalUserId: string): number {
			const now = nowFn();
			const valid = getValidTimestamps(externalUserId, now);
			return Math.max(0, config.maxMessages - valid.length);
		},
	};
}

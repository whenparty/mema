import type {
	DialogStateTimeoutScheduler,
	DialogStateTimeoutSchedulerDeps,
	ScheduledDialogStateRef,
} from "./dialog-state-types";

export function createDialogStateTimeoutScheduler(
	deps?: DialogStateTimeoutSchedulerDeps,
): DialogStateTimeoutScheduler {
	const setTimeoutFn = deps?.setTimeoutFn ?? setTimeout;
	const clearTimeoutFn = deps?.clearTimeoutFn ?? clearTimeout;
	const timers = new Map<string, ReturnType<typeof setTimeout>>();

	return {
		schedule(ref: ScheduledDialogStateRef, onTimeout: () => Promise<void>): void {
			const existing = timers.get(ref.userId);
			if (existing !== undefined) {
				clearTimeoutFn(existing);
			}

			const delay = ref.expectedExpiresAt.getTime() - ref.expectedCreatedAt.getTime();

			const handle = setTimeoutFn(async () => {
				timers.delete(ref.userId);
				try {
					await onTimeout();
				} catch (_error: unknown) {
					// Catch rejection — do not re-schedule.
					// Persisted expiresAt remains the inbound reconciliation truth.
				}
			}, delay);

			timers.set(ref.userId, handle);
		},

		cancel(userId: string): void {
			const existing = timers.get(userId);
			if (existing !== undefined) {
				clearTimeoutFn(existing);
				timers.delete(userId);
			}
		},
	};
}

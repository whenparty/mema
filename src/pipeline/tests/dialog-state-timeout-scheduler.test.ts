import { describe, expect, it, vi } from "vitest";
import { createDialogStateTimeoutScheduler } from "../dialog-state-timeout-scheduler";
import type { ScheduledDialogStateRef } from "../dialog-state-types";

function makeRef(overrides?: Partial<ScheduledDialogStateRef>): ScheduledDialogStateRef {
	const now = new Date("2026-03-22T12:00:00Z");
	return {
		userId: "user-1",
		externalUserId: "tg-user-1",
		expectedCreatedAt: now,
		expectedExpiresAt: new Date(now.getTime() + 30 * 60 * 1000),
		...overrides,
	};
}

describe("createDialogStateTimeoutScheduler", () => {
	it("fires onTimeout callback after scheduled delay", async () => {
		const fakeSetTimeout = vi.fn().mockReturnValue(1);
		const fakeClearTimeout = vi.fn();

		const scheduler = createDialogStateTimeoutScheduler({
			setTimeoutFn: fakeSetTimeout as unknown as typeof setTimeout,
			clearTimeoutFn: fakeClearTimeout,
		});

		const onTimeout = vi.fn().mockResolvedValue(undefined);
		const ref = makeRef();

		scheduler.schedule(ref, onTimeout);

		expect(fakeSetTimeout).toHaveBeenCalledOnce();

		const timerCallback = fakeSetTimeout.mock.calls[0][0] as () => Promise<void>;
		await timerCallback();

		expect(onTimeout).toHaveBeenCalledOnce();
	});

	it("reschedule replaces the prior timer for the same userId", () => {
		const fakeSetTimeout = vi.fn().mockReturnValueOnce(1).mockReturnValueOnce(2);
		const fakeClearTimeout = vi.fn();

		const scheduler = createDialogStateTimeoutScheduler({
			setTimeoutFn: fakeSetTimeout as unknown as typeof setTimeout,
			clearTimeoutFn: fakeClearTimeout,
		});

		const ref1 = makeRef();
		const ref2 = makeRef({
			expectedExpiresAt: new Date("2026-03-22T13:00:00Z"),
		});

		scheduler.schedule(ref1, vi.fn());
		scheduler.schedule(ref2, vi.fn());

		expect(fakeClearTimeout).toHaveBeenCalledWith(1);
		expect(fakeSetTimeout).toHaveBeenCalledTimes(2);
	});

	it("cancel prevents timeout from firing", () => {
		const fakeSetTimeout = vi.fn().mockReturnValue(42);
		const fakeClearTimeout = vi.fn();

		const scheduler = createDialogStateTimeoutScheduler({
			setTimeoutFn: fakeSetTimeout as unknown as typeof setTimeout,
			clearTimeoutFn: fakeClearTimeout,
		});

		scheduler.schedule(makeRef(), vi.fn());
		scheduler.cancel("user-1");

		expect(fakeClearTimeout).toHaveBeenCalledWith(42);
	});

	it("already-expired state fires immediately (zero or negative delay)", async () => {
		const fakeSetTimeout = vi.fn().mockReturnValue(1);
		const fakeClearTimeout = vi.fn();

		const scheduler = createDialogStateTimeoutScheduler({
			setTimeoutFn: fakeSetTimeout as unknown as typeof setTimeout,
			clearTimeoutFn: fakeClearTimeout,
		});

		const expiredRef = makeRef({
			expectedExpiresAt: new Date("2026-03-22T11:00:00Z"),
		});
		const onTimeout = vi.fn().mockResolvedValue(undefined);

		scheduler.schedule(expiredRef, onTimeout);

		expect(fakeSetTimeout).toHaveBeenCalledOnce();
		const [, delay] = fakeSetTimeout.mock.calls[0];
		expect(delay).toBeLessThanOrEqual(0);
	});

	it("callback rejection is caught and does not re-schedule", async () => {
		const fakeSetTimeout = vi.fn().mockReturnValue(1);
		const fakeClearTimeout = vi.fn();

		const scheduler = createDialogStateTimeoutScheduler({
			setTimeoutFn: fakeSetTimeout as unknown as typeof setTimeout,
			clearTimeoutFn: fakeClearTimeout,
		});

		const failingCallback = vi.fn().mockRejectedValue(new Error("timeout handler failed"));
		scheduler.schedule(makeRef(), failingCallback);

		const timerCallback = fakeSetTimeout.mock.calls[0][0] as () => Promise<void>;

		await expect(timerCallback()).resolves.toBeUndefined();

		expect(fakeSetTimeout).toHaveBeenCalledTimes(1);
	});

	it("cancel is a no-op for unknown userId", () => {
		const fakeSetTimeout = vi.fn();
		const fakeClearTimeout = vi.fn();

		const scheduler = createDialogStateTimeoutScheduler({
			setTimeoutFn: fakeSetTimeout as unknown as typeof setTimeout,
			clearTimeoutFn: fakeClearTimeout,
		});

		expect(() => scheduler.cancel("nonexistent")).not.toThrow();
		expect(fakeClearTimeout).not.toHaveBeenCalled();
	});

	it("timer map key is internal userId, not external Telegram ID", () => {
		const fakeSetTimeout = vi.fn().mockReturnValueOnce(1).mockReturnValueOnce(2);
		const fakeClearTimeout = vi.fn();

		const scheduler = createDialogStateTimeoutScheduler({
			setTimeoutFn: fakeSetTimeout as unknown as typeof setTimeout,
			clearTimeoutFn: fakeClearTimeout,
		});

		const refA = makeRef({ userId: "user-A", externalUserId: "tg-1" });
		const refB = makeRef({ userId: "user-B", externalUserId: "tg-2" });

		scheduler.schedule(refA, vi.fn());
		scheduler.schedule(refB, vi.fn());

		expect(fakeClearTimeout).not.toHaveBeenCalled();
		expect(fakeSetTimeout).toHaveBeenCalledTimes(2);

		scheduler.cancel("user-A");
		expect(fakeClearTimeout).toHaveBeenCalledWith(1);
	});
});

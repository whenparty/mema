import { describe, expect, it } from "vitest";
import { createRateLimiter } from "../rate-limiter";

const CONFIG = { maxMessages: 3, windowMs: 60_000 };

function setup(startTime = 0) {
	let now = startTime;
	const limiter = createRateLimiter(CONFIG, { nowFn: () => now });
	return {
		limiter,
		advance: (ms: number) => {
			now += ms;
		},
	};
}

describe("createRateLimiter", () => {
	it("admits messages up to maxMessages", () => {
		const { limiter } = setup();
		expect(limiter.tryAdmit("user-1")).toBe(true);
		expect(limiter.tryAdmit("user-1")).toBe(true);
		expect(limiter.tryAdmit("user-1")).toBe(true);
		expect(limiter.getRemainingCapacity("user-1")).toBe(0);
	});

	it("rejects the message after maxMessages is reached", () => {
		const { limiter } = setup();
		for (let i = 0; i < CONFIG.maxMessages; i++) {
			limiter.tryAdmit("user-1");
		}
		expect(limiter.tryAdmit("user-1")).toBe(false);
	});

	it("does not count rejected messages", () => {
		const { limiter, advance } = setup(1000);

		for (let i = 0; i < CONFIG.maxMessages; i++) {
			limiter.tryAdmit("user-1");
			advance(100);
		}

		for (let i = 0; i < 50; i++) {
			expect(limiter.tryAdmit("user-1")).toBe(false);
			advance(100);
		}

		expect(limiter.getRemainingCapacity("user-1")).toBe(0);

		advance(CONFIG.windowMs);

		expect(limiter.tryAdmit("user-1")).toBe(true);
	});

	it("resumes admission after oldest messages expire (sliding window)", () => {
		const { limiter, advance } = setup(1000);

		limiter.tryAdmit("user-1");
		advance(10_000);
		limiter.tryAdmit("user-1");
		advance(10_000);
		limiter.tryAdmit("user-1");

		expect(limiter.tryAdmit("user-1")).toBe(false);

		advance(CONFIG.windowMs - 20_000 + 1);
		expect(limiter.tryAdmit("user-1")).toBe(true);
	});

	it("restores full capacity after window elapses (no active timestamps)", () => {
		const { limiter, advance } = setup(1000);

		limiter.tryAdmit("user-1");
		advance(CONFIG.windowMs + 1);

		expect(limiter.getRemainingCapacity("user-1")).toBe(CONFIG.maxMessages);
		expect(limiter.tryAdmit("user-1")).toBe(true);
	});

	it("maintains independent windows per user", () => {
		const { limiter } = setup();

		for (let i = 0; i < CONFIG.maxMessages; i++) {
			limiter.tryAdmit("user-a");
		}
		expect(limiter.tryAdmit("user-a")).toBe(false);

		expect(limiter.tryAdmit("user-b")).toBe(true);
		expect(limiter.getRemainingCapacity("user-b")).toBe(CONFIG.maxMessages - 1);
	});

	it("repeated getRemainingCapacity does not change reported capacity before tryAdmit", () => {
		const { limiter } = setup();

		limiter.tryAdmit("user-1");
		const capacityBefore = limiter.getRemainingCapacity("user-1");
		limiter.getRemainingCapacity("user-1");
		limiter.getRemainingCapacity("user-1");
		const capacityAfter = limiter.getRemainingCapacity("user-1");

		expect(capacityBefore).toBe(capacityAfter);
		expect(limiter.tryAdmit("user-1")).toBe(true);
	});

	it("returns full capacity for unknown users", () => {
		const { limiter } = setup();
		expect(limiter.getRemainingCapacity("unknown")).toBe(CONFIG.maxMessages);
	});

	it("rejects invalid maxMessages", () => {
		for (const maxMessages of [0, -1, 1.5, Number.NaN, Number.POSITIVE_INFINITY]) {
			expect(() => createRateLimiter({ maxMessages, windowMs: 60_000 })).toThrow(
				/maxMessages must be a finite positive integer/,
			);
		}
	});

	it("rejects invalid windowMs", () => {
		for (const windowMs of [0, -1, 1000.5, Number.NaN]) {
			expect(() => createRateLimiter({ maxMessages: 3, windowMs })).toThrow(
				/windowMs must be a finite positive integer/,
			);
		}
	});
});

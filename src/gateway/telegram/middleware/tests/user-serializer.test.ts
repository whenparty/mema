import type { Context, NextFunction } from "grammy";
import { describe, expect, it, vi } from "vitest";
import { createUserSerializer } from "../user-serializer";

// Mock logger to avoid noisy output during tests
vi.mock("@/shared/logger", () => {
	const mockLogger = {
		info: vi.fn(),
		warn: vi.fn(),
		error: vi.fn(),
		debug: vi.fn(),
		child: vi.fn().mockReturnThis(),
	};
	return {
		createChildLogger: vi.fn().mockReturnValue(mockLogger),
		logger: mockLogger,
	};
});

function createMockContext(userId?: number): Context {
	if (userId === undefined) {
		return { from: undefined } as unknown as Context;
	}
	return { from: { id: userId } } as unknown as Context;
}

interface Deferred {
	promise: Promise<void>;
	resolve: () => void;
	reject: (error: Error) => void;
}

function createDeferred(): Deferred {
	let resolve = (): void => {};
	let reject = (_error: Error): void => {};
	const promise = new Promise<void>((res, rej) => {
		resolve = res;
		reject = rej;
	});
	return { promise, resolve, reject };
}

describe("createUserSerializer", () => {
	it("calls next() for a message with valid ctx.from", async () => {
		const { middleware } = createUserSerializer();
		const ctx = createMockContext(42);
		const next = vi.fn().mockResolvedValue(undefined);

		await middleware(ctx, next);

		expect(next).toHaveBeenCalledOnce();
	});

	it("calls next() when ctx.from is undefined (no locking)", async () => {
		const { middleware } = createUserSerializer();
		const ctx = createMockContext();
		const next = vi.fn().mockResolvedValue(undefined);

		await middleware(ctx, next);

		expect(next).toHaveBeenCalledOnce();
	});

	it("processes two messages from the same user sequentially", async () => {
		const { middleware } = createUserSerializer();
		const ctx = createMockContext(42);

		const executionOrder: string[] = [];
		const firstDeferred = createDeferred();
		const secondDeferred = createDeferred();

		const firstNext: NextFunction = async () => {
			executionOrder.push("first-start");
			await firstDeferred.promise;
			executionOrder.push("first-end");
		};

		const secondNext: NextFunction = async () => {
			executionOrder.push("second-start");
			await secondDeferred.promise;
			executionOrder.push("second-end");
		};

		// Start both middleware calls (neither next() has resolved yet)
		const firstPromise = middleware(ctx, firstNext);
		const secondPromise = middleware(ctx, secondNext);

		// Let microtasks settle - first should be running, second should be waiting
		await new Promise((resolve) => setTimeout(resolve, 10));

		expect(executionOrder).toEqual(["first-start"]);

		// Complete the first message
		firstDeferred.resolve();
		await new Promise((resolve) => setTimeout(resolve, 10));

		expect(executionOrder).toEqual(["first-start", "first-end", "second-start"]);

		// Complete the second message
		secondDeferred.resolve();
		await Promise.all([firstPromise, secondPromise]);

		expect(executionOrder).toEqual(["first-start", "first-end", "second-start", "second-end"]);
	});

	it("processes messages from different users in parallel", async () => {
		const { middleware } = createUserSerializer();
		const ctxUser1 = createMockContext(42);
		const ctxUser2 = createMockContext(99);

		const executionOrder: string[] = [];
		const firstDeferred = createDeferred();
		const secondDeferred = createDeferred();

		const firstNext: NextFunction = async () => {
			executionOrder.push("user1-start");
			await firstDeferred.promise;
			executionOrder.push("user1-end");
		};

		const secondNext: NextFunction = async () => {
			executionOrder.push("user2-start");
			await secondDeferred.promise;
			executionOrder.push("user2-end");
		};

		const firstPromise = middleware(ctxUser1, firstNext);
		const secondPromise = middleware(ctxUser2, secondNext);

		// Let microtasks settle - both should be running in parallel
		await new Promise((resolve) => setTimeout(resolve, 10));

		expect(executionOrder).toEqual(["user1-start", "user2-start"]);

		// Complete both
		firstDeferred.resolve();
		secondDeferred.resolve();
		await Promise.all([firstPromise, secondPromise]);

		expect(executionOrder).toContain("user1-end");
		expect(executionOrder).toContain("user2-end");
	});

	it("third message from the same user waits for both previous", async () => {
		const { middleware } = createUserSerializer();
		const ctx = createMockContext(42);

		const executionOrder: string[] = [];
		const deferreds = [createDeferred(), createDeferred(), createDeferred()];

		const createNext = (label: string, index: number): NextFunction => {
			return async () => {
				executionOrder.push(`${label}-start`);
				await deferreds[index].promise;
				executionOrder.push(`${label}-end`);
			};
		};

		const promise1 = middleware(ctx, createNext("first", 0));
		const promise2 = middleware(ctx, createNext("second", 1));
		const promise3 = middleware(ctx, createNext("third", 2));

		await new Promise((resolve) => setTimeout(resolve, 10));
		expect(executionOrder).toEqual(["first-start"]);

		// Complete first -> second should start
		deferreds[0].resolve();
		await new Promise((resolve) => setTimeout(resolve, 10));
		expect(executionOrder).toEqual(["first-start", "first-end", "second-start"]);

		// Complete second -> third should start
		deferreds[1].resolve();
		await new Promise((resolve) => setTimeout(resolve, 10));
		expect(executionOrder).toEqual([
			"first-start",
			"first-end",
			"second-start",
			"second-end",
			"third-start",
		]);

		// Complete third
		deferreds[2].resolve();
		await Promise.all([promise1, promise2, promise3]);
		expect(executionOrder).toEqual([
			"first-start",
			"first-end",
			"second-start",
			"second-end",
			"third-start",
			"third-end",
		]);
	});

	it("if next() throws, the next message still proceeds (chain recovery)", async () => {
		const { middleware } = createUserSerializer();
		const ctx = createMockContext(42);

		const executionOrder: string[] = [];
		const secondDeferred = createDeferred();

		const failingNext: NextFunction = async () => {
			executionOrder.push("failing-start");
			throw new Error("handler error");
		};

		const secondNext: NextFunction = async () => {
			executionOrder.push("second-start");
			await secondDeferred.promise;
			executionOrder.push("second-end");
		};

		const firstPromise = middleware(ctx, failingNext);
		const secondPromise = middleware(ctx, secondNext);

		// First should throw, but the chain should not break
		await expect(firstPromise).rejects.toThrow("handler error");

		// Let microtasks settle - second should now be running
		await new Promise((resolve) => setTimeout(resolve, 10));
		expect(executionOrder).toContain("second-start");

		// Complete second
		secondDeferred.resolve();
		await secondPromise;
		expect(executionOrder).toEqual(["failing-start", "second-start", "second-end"]);
	});

	it("pendingCount() reflects active user locks", async () => {
		const { middleware, pendingCount } = createUserSerializer();

		expect(pendingCount()).toBe(0);

		const deferred1 = createDeferred();
		const deferred2 = createDeferred();

		const promise1 = middleware(createMockContext(42), async () => {
			await deferred1.promise;
		});

		const promise2 = middleware(createMockContext(99), async () => {
			await deferred2.promise;
		});

		await new Promise((resolve) => setTimeout(resolve, 10));
		expect(pendingCount()).toBe(2);

		deferred1.resolve();
		await promise1;
		expect(pendingCount()).toBe(1);

		deferred2.resolve();
		await promise2;
		expect(pendingCount()).toBe(0);
	});

	it("after all messages complete, pendingCount() returns 0 (cleanup)", async () => {
		const { middleware, pendingCount } = createUserSerializer();

		const deferred = createDeferred();
		const promise = middleware(createMockContext(42), async () => {
			await deferred.promise;
		});

		await new Promise((resolve) => setTimeout(resolve, 10));
		expect(pendingCount()).toBe(1);

		deferred.resolve();
		await promise;

		expect(pendingCount()).toBe(0);
	});
});

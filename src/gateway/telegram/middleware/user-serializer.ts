import { createChildLogger } from "@/shared/logger";
import type { Context, NextFunction } from "grammy";

const log = createChildLogger({ module: "telegram", middleware: "user-serializer" });

export interface UserSerializer {
	middleware: (ctx: Context, next: NextFunction) => Promise<void>;
	pendingCount: () => number;
}

export function createUserSerializer(): UserSerializer {
	const locks = new Map<string, Promise<void>>();

	async function middleware(ctx: Context, next: NextFunction): Promise<void> {
		const userId = ctx.from?.id.toString();
		if (!userId) {
			await next();
			return;
		}

		// The executor runs synchronously, so releaseLock is assigned before use
		let releaseLock = (): void => {};
		const lockPromise = new Promise<void>((resolve) => {
			releaseLock = resolve;
		});

		// Chain: set lock BEFORE any await (atomic w.r.t. event loop)
		const previous = locks.get(userId) ?? Promise.resolve();
		locks.set(userId, lockPromise);

		log.debug({ userId }, "waiting for previous message to complete");

		// Wait for previous message from this user to finish
		await previous;

		log.debug({ userId }, "processing message");

		try {
			await next();
		} finally {
			releaseLock();
			if (locks.get(userId) === lockPromise) {
				locks.delete(userId);
			}
		}
	}

	return {
		middleware,
		pendingCount: () => locks.size,
	};
}

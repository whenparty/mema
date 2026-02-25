import { createChildLogger } from "@/shared/logger";
import type { Context, MiddlewareFn, NextFunction } from "grammy";
import type { DuplicateChecker } from "../types";

const log = createChildLogger({ module: "telegram", middleware: "dedup-guard" });

export interface DedupGuard {
	middleware: MiddlewareFn<Context>;
}

export function createDedupGuard(isDuplicate: DuplicateChecker): DedupGuard {
	async function middleware(ctx: Context, next: NextFunction): Promise<void> {
		const userId = ctx.from?.id.toString();
		if (!userId) {
			await next();
			return;
		}

		const updateId = ctx.update.update_id;

		if (await isDuplicate(userId, updateId)) {
			log.warn({ telegramUserId: userId, updateId }, "duplicate update detected, skipping");
			return;
		}

		await next();
	}

	return { middleware };
}

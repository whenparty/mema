import { createChildLogger } from "@/shared/logger";
import type { Context, NextFunction } from "grammy";

const log = createChildLogger({ module: "telegram", middleware: "private-only" });

export async function privateOnly(ctx: Context, next: NextFunction): Promise<void> {
	if (ctx.chat?.type !== "private") {
		log.debug({ chatType: ctx.chat?.type }, "ignoring non-private chat update");
		return;
	}

	await next();
}

import { and, eq } from "drizzle-orm";
import type { DbClient } from "../client";
import { messages } from "../schema/messages";
import { userAuths } from "../schema/users";

export function createDuplicateChecker(
	db: DbClient,
): (telegramUserId: string, updateId: number) => Promise<boolean> {
	return async (telegramUserId: string, updateId: number): Promise<boolean> => {
		// Step 1: Find the internal user ID via user_auths
		const authRows = await db
			.select({ userId: userAuths.userId })
			.from(userAuths)
			.where(and(eq(userAuths.provider, "telegram"), eq(userAuths.externalId, telegramUserId)));

		if (authRows.length === 0) {
			return false;
		}

		const internalUserId = authRows[0].userId;

		// Step 2: Check if a message with this update_id already exists for the user
		const messageRows = await db
			.select({ id: messages.id })
			.from(messages)
			.where(
				and(
					eq(messages.userId, internalUserId),
					eq(messages.telegramUpdateId, updateId.toString()),
				),
			);

		return messageRows.length > 0;
	};
}

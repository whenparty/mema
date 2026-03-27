import { and, eq } from "drizzle-orm";
import type { DbClient } from "../client";
import { userAuths } from "../schema/users";

export function createResolveTelegramUserId(
	db: DbClient,
): (externalId: string) => Promise<string | null> {
	return async (externalId: string): Promise<string | null> => {
		const rows = await db
			.select({ userId: userAuths.userId })
			.from(userAuths)
			.where(and(eq(userAuths.provider, "telegram"), eq(userAuths.externalId, externalId)));

		if (rows.length === 0) {
			return null;
		}

		return rows[0].userId;
	};
}

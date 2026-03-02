import { and, eq, sql } from "drizzle-orm";
import type { DbClient } from "../client";
import { tokenUsages } from "../schema/token-usages";

interface UpsertTokenUsageParams {
	userId: string;
	tokensToAdd: number;
	periodStart: Date;
	quotaLimit: number;
}

export async function upsertTokenUsage(
	db: DbClient,
	params: UpsertTokenUsageParams,
): Promise<typeof tokenUsages.$inferSelect> {
	const { userId, tokensToAdd, periodStart, quotaLimit } = params;

	const rows = await db
		.insert(tokenUsages)
		.values({
			userId,
			periodStart,
			tokensUsed: tokensToAdd,
			quotaLimit,
		})
		.onConflictDoUpdate({
			target: [tokenUsages.userId, tokenUsages.periodStart],
			set: {
				tokensUsed: sql`${tokenUsages.tokensUsed} + ${tokensToAdd}`,
				updatedAt: new Date(),
			},
		})
		.returning();

	const row = rows[0];
	if (!row) {
		throw new Error(`upsertTokenUsage: expected a row to be returned for user ${userId}`);
	}

	return row;
}

export async function getTokenUsage(db: DbClient, userId: string, periodStart: Date) {
	const rows = await db
		.select()
		.from(tokenUsages)
		.where(and(eq(tokenUsages.userId, userId), eq(tokenUsages.periodStart, periodStart)));

	if (rows.length === 0) {
		return null;
	}

	return rows[0];
}

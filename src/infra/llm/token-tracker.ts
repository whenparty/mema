import type { DbClient } from "@/infra/db/client";
import { getTokenUsage, upsertTokenUsage } from "@/infra/db/queries/token-usage";
import { createChildLogger } from "@/shared/logger";

export interface TokenQuotaResult {
	exceeded: boolean;
	tokensUsed: number;
	quotaLimit: number;
	periodStart: Date;
}

export interface TokenUsageRecord {
	id: string;
	userId: string;
	periodStart: Date;
	tokensUsed: number;
	quotaLimit: number;
	updatedAt: Date;
}

export interface TokenTracker {
	recordUsage(
		userId: string,
		model: string,
		inputTokens: number,
		outputTokens: number,
	): Promise<void>;
	checkQuota(userId: string): Promise<TokenQuotaResult>;
	getUsage(userId: string): Promise<TokenUsageRecord | null>;
}

interface TokenTrackerConfig {
	db: DbClient;
	defaultQuotaLimit: number;
}

/**
 * Returns the first day of the current month in UTC.
 * Exported for testability.
 */
export function getCurrentPeriodStart(): Date {
	const now = new Date();
	return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
}

export function createTokenTracker(config: TokenTrackerConfig): TokenTracker {
	const { db, defaultQuotaLimit } = config;
	const log = createChildLogger({ module: "token-tracker" });

	return {
		async recordUsage(
			userId: string,
			model: string,
			inputTokens: number,
			outputTokens: number,
		): Promise<void> {
			const totalTokens = inputTokens + outputTokens;
			const periodStart = getCurrentPeriodStart();

			await upsertTokenUsage(db, {
				userId,
				tokensToAdd: totalTokens,
				periodStart,
				quotaLimit: defaultQuotaLimit,
			});

			log.info(
				{
					userId,
					model,
					inputTokens,
					outputTokens,
					totalTokens,
					periodStart: periodStart.toISOString(),
				},
				"token usage recorded",
			);
		},

		async checkQuota(userId: string): Promise<TokenQuotaResult> {
			const periodStart = getCurrentPeriodStart();
			const record = await getTokenUsage(db, userId, periodStart);

			if (!record) {
				return {
					exceeded: false,
					tokensUsed: 0,
					quotaLimit: defaultQuotaLimit,
					periodStart,
				};
			}

			// quotaLimit === 0 means unlimited
			const exceeded = record.quotaLimit !== 0 && record.tokensUsed >= record.quotaLimit;

			return {
				exceeded,
				tokensUsed: record.tokensUsed,
				quotaLimit: record.quotaLimit,
				periodStart,
			};
		},

		async getUsage(userId: string): Promise<TokenUsageRecord | null> {
			const periodStart = getCurrentPeriodStart();
			return getTokenUsage(db, userId, periodStart);
		},
	};
}

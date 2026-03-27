import type { PipelineStep } from "../types";

export interface QuotaCheckResult {
	exceeded: boolean;
	tokensUsed: number;
	quotaLimit: number;
	periodStart: Date;
}

export interface TokenQuotaStepDeps {
	resolveUserId: (externalId: string) => Promise<string | null>;
	checkQuota: (userId: string) => Promise<QuotaCheckResult>;
	notifyAdmin: (message: string) => Promise<void>;
}

export function getNextPeriodStart(periodStart: Date): Date {
	const year = periodStart.getUTCFullYear();
	const month = periodStart.getUTCMonth();
	return new Date(Date.UTC(year, month + 1, 1));
}

const MONTH_NAMES = [
	"January",
	"February",
	"March",
	"April",
	"May",
	"June",
	"July",
	"August",
	"September",
	"October",
	"November",
	"December",
];

function formatResetDate(periodStart: Date): string {
	const next = getNextPeriodStart(periodStart);
	return `${MONTH_NAMES[next.getUTCMonth()]} ${next.getUTCDate()}, ${next.getUTCFullYear()}`;
}

export const QUOTA_EXCEEDED_WARNING =
	"You've reached your monthly usage limit. Your quota resets on";

export function createTokenQuotaStep(deps: TokenQuotaStepDeps): PipelineStep {
	const { resolveUserId, checkQuota, notifyAdmin } = deps;

	return async (ctx, log) => {
		const { externalUserId } = ctx.input;

		const userId = await resolveUserId(externalUserId);
		if (userId === null) {
			return;
		}

		ctx.userId = userId;

		const result = await checkQuota(userId);

		if (result.quotaLimit === 0 || !result.exceeded) {
			return;
		}

		const resetDate = formatResetDate(result.periodStart);
		ctx.earlyResponse = `${QUOTA_EXCEEDED_WARNING} ${resetDate}. Please try again then.`;

		log.warn(
			{
				event: "token_quota_exceeded",
				externalUserId,
				userId,
				tokensUsed: result.tokensUsed,
				quotaLimit: result.quotaLimit,
				periodStart: result.periodStart.toISOString(),
			},
			"token quota exceeded",
		);

		try {
			await notifyAdmin(
				`Token quota exceeded for user ${userId}: ${result.tokensUsed}/${result.quotaLimit} tokens used.`,
			);
		} catch (error: unknown) {
			log.warn(
				{
					event: "admin_notification_failed",
					userId,
					error: error instanceof Error ? error.message : "unknown",
				},
				"failed to notify admin about quota exceed",
			);
		}
	};
}

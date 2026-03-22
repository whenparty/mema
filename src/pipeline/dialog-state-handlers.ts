import type {
	AccountDeleteDecision,
	AccountDeleteDialogStateContext,
	ConflictDecision,
	ConflictDialogStateContext,
	DeleteDecision,
	DeleteDialogStateContext,
	DialogStateCompletionArgs,
	DialogStateHandler,
	DialogStateHandlerRegistry,
	DialogStateHandlerResult,
	EntityDisambiguationDecision,
	EntityDisambiguationDialogStateContext,
	InterestDecision,
	InterestDialogStateContext,
	MissingDataDecision,
	MissingDataDialogStateContext,
	RecentResetHint,
} from "./dialog-state-types";

const RECENT_RESET_TTL_MS = 5 * 60 * 1000;
const ALLOWED_REPLIES = ["yes", "no", "ok"] as const;

function isNonEmptyString(value: unknown): value is string {
	return typeof value === "string" && value.trim().length > 0;
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function normalizeText(text: string): string {
	return text
		.trim()
		.toLowerCase()
		.replace(/[^a-z0-9\s]/g, " ")
		.replace(/\s+/g, " ")
		.trim();
}

function matchesAny(text: string, patterns: string[]): boolean {
	const norm = normalizeText(text);
	return patterns.some((pattern) => {
		const candidate = normalizeText(pattern);
		return (
			norm === candidate ||
			norm.startsWith(`${candidate} `) ||
			norm.endsWith(` ${candidate}`) ||
			norm.includes(` ${candidate} `)
		);
	});
}

function makeHint(
	subtype: RecentResetHint["subtype"],
	reason: "timeout" | "off_topic",
	now: Date,
	timeoutMessage: string,
	recoveryMessage: string,
): RecentResetHint {
	return {
		subtype,
		reason,
		expiresAt: new Date(now.getTime() + RECENT_RESET_TTL_MS),
		allowedReplies: ALLOWED_REPLIES,
		timeoutMessage,
		recoveryMessage,
	};
}

function createConflictHandler(): DialogStateHandler<
	"conflict",
	ConflictDialogStateContext,
	ConflictDecision,
	DialogStateCompletionArgs<ConflictDialogStateContext, ConflictDecision>
> {
	return {
		subtype: "conflict",
		expectedState: "confirm",

		parseContext(raw: unknown): ConflictDialogStateContext | null {
			if (!isRecord(raw)) return null;
			if (raw.type !== "conflict") return null;
			if (!isNonEmptyString(raw.existingFactId)) return null;
			if (!isNonEmptyString(raw.existingFactSummary)) return null;
			if (!isNonEmptyString(raw.pendingFactSummary)) return null;
			if (!isRecord(raw.resumePayload)) return null;
			return raw as unknown as ConflictDialogStateContext;
		},

		matchResponse(messageText, context) {
			const norm = normalizeText(messageText);

			if (matchesAny(norm, ["both", "coexist"])) {
				const decision: ConflictDecision = { action: "coexist" };
				return {
					kind: "matched",
					decision,
					completionArgs: { userId: "", replyText: messageText, context, decision },
				};
			}

			if (matchesAny(norm, ["yes", "yeah", "ok", "update", "confirm", "replace"])) {
				const decision: ConflictDecision = { action: "confirm_update" };
				return {
					kind: "matched",
					decision,
					completionArgs: { userId: "", replyText: messageText, context, decision },
				};
			}

			if (matchesAny(norm, ["no", "keep", "don't", "dont", "cancel", "nah"])) {
				const decision: ConflictDecision = { action: "keep_existing" };
				return {
					kind: "matched",
					decision,
					completionArgs: { userId: "", replyText: messageText, context, decision },
				};
			}

			return { kind: "ambiguous" };
		},

		buildRecentResetHint(context, reason, now) {
			return makeHint(
				"conflict",
				reason,
				now,
				`The question about "${context.pendingFactSummary}" vs "${context.existingFactSummary}" has expired.`,
				"I recently asked about a conflict between your facts. Would you like me to ask again?",
			);
		},
	};
}

function createDeleteHandler(): DialogStateHandler<
	"delete",
	DeleteDialogStateContext,
	DeleteDecision,
	DialogStateCompletionArgs<DeleteDialogStateContext, DeleteDecision>
> {
	return {
		subtype: "delete",
		expectedState: "confirm",

		parseContext(raw: unknown): DeleteDialogStateContext | null {
			if (!isRecord(raw)) return null;
			if (raw.type !== "delete") return null;
			if (raw.deleteMode !== "fact" && raw.deleteMode !== "entity") return null;
			if (!isNonEmptyString(raw.targetLabel)) return null;
			if (!isRecord(raw.resumePayload)) return null;

			if (raw.deleteMode === "fact") {
				if (!Array.isArray(raw.factIds) || raw.factIds.length === 0) return null;
				if (!raw.factIds.every((id: unknown) => isNonEmptyString(id))) return null;
			}
			if (raw.deleteMode === "entity") {
				if (!isNonEmptyString(raw.entityId)) return null;
			}

			return raw as unknown as DeleteDialogStateContext;
		},

		matchResponse(messageText, context) {
			if (matchesAny(messageText, ["yes", "yeah", "ok", "confirm", "delete"])) {
				const decision: DeleteDecision = { action: "confirm_delete" };
				return {
					kind: "matched",
					decision,
					completionArgs: { userId: "", replyText: messageText, context, decision },
				};
			}

			if (matchesAny(messageText, ["no", "cancel", "don't", "dont", "keep", "nah"])) {
				const decision: DeleteDecision = { action: "cancel_delete" };
				return {
					kind: "matched",
					decision,
					completionArgs: { userId: "", replyText: messageText, context, decision },
				};
			}

			return { kind: "ambiguous" };
		},

		buildRecentResetHint(context, reason, now) {
			return makeHint(
				"delete",
				reason,
				now,
				`The question about deleting "${context.targetLabel}" has expired.`,
				"I recently asked about deleting something. Would you like me to ask again?",
			);
		},
	};
}

function createAccountDeleteHandler(): DialogStateHandler<
	"account_delete",
	AccountDeleteDialogStateContext,
	AccountDeleteDecision,
	DialogStateCompletionArgs<AccountDeleteDialogStateContext, AccountDeleteDecision>
> {
	return {
		subtype: "account_delete",
		expectedState: "confirm",

		parseContext(raw: unknown): AccountDeleteDialogStateContext | null {
			if (!isRecord(raw)) return null;
			if (raw.type !== "account_delete") return null;
			return raw as unknown as AccountDeleteDialogStateContext;
		},

		matchResponse(messageText, context) {
			if (matchesAny(messageText, ["yes", "yeah", "ok", "confirm", "delete"])) {
				const decision: AccountDeleteDecision = { action: "confirm_delete_account" };
				return {
					kind: "matched",
					decision,
					completionArgs: { userId: "", replyText: messageText, context, decision },
				};
			}

			if (matchesAny(messageText, ["no", "cancel", "don't", "dont", "keep", "nah"])) {
				const decision: AccountDeleteDecision = { action: "cancel_delete_account" };
				return {
					kind: "matched",
					decision,
					completionArgs: { userId: "", replyText: messageText, context, decision },
				};
			}

			return { kind: "ambiguous" };
		},

		buildRecentResetHint(_context, reason, now) {
			return makeHint(
				"account_delete",
				reason,
				now,
				"The account deletion request has expired.",
				"I recently asked about deleting your account. Would you like me to ask again?",
			);
		},
	};
}

function createInterestHandler(): DialogStateHandler<
	"interest",
	InterestDialogStateContext,
	InterestDecision,
	DialogStateCompletionArgs<InterestDialogStateContext, InterestDecision>
> {
	return {
		subtype: "interest",
		expectedState: "confirm",

		parseContext(raw: unknown): InterestDialogStateContext | null {
			if (!isRecord(raw)) return null;
			if (raw.type !== "interest") return null;
			if (!isNonEmptyString(raw.candidateId)) return null;
			if (!isNonEmptyString(raw.topic)) return null;
			if (!isRecord(raw.resumePayload)) return null;
			return raw as unknown as InterestDialogStateContext;
		},

		matchResponse(messageText, context) {
			if (matchesAny(messageText, ["yes", "yeah", "ok", "sure", "sounds good", "confirm"])) {
				const decision: InterestDecision = { action: "confirm_interest" };
				return {
					kind: "matched",
					decision,
					completionArgs: { userId: "", replyText: messageText, context, decision },
				};
			}

			if (
				matchesAny(messageText, ["no", "nah", "not interested", "dismiss", "don't", "dont", "skip"])
			) {
				const decision: InterestDecision = { action: "dismiss_interest" };
				return {
					kind: "matched",
					decision,
					completionArgs: { userId: "", replyText: messageText, context, decision },
				};
			}

			return { kind: "ambiguous" };
		},

		buildRecentResetHint(context, reason, now) {
			return makeHint(
				"interest",
				reason,
				now,
				`The question about "${context.topic}" has expired.`,
				"I recently suggested something you might be interested in. Would you like me to ask again?",
			);
		},
	};
}

function createMissingDataHandler(): DialogStateHandler<
	"missing_data",
	MissingDataDialogStateContext,
	MissingDataDecision,
	DialogStateCompletionArgs<MissingDataDialogStateContext, MissingDataDecision>
> {
	const dateKeywords = [
		"today",
		"tomorrow",
		"tonight",
		"monday",
		"tuesday",
		"wednesday",
		"thursday",
		"friday",
		"saturday",
		"sunday",
		"january",
		"february",
		"march",
		"april",
		"may",
		"june",
		"july",
		"august",
		"september",
		"october",
		"november",
		"december",
	];

	return {
		subtype: "missing_data",
		expectedState: "await",

		parseContext(raw: unknown): MissingDataDialogStateContext | null {
			if (!isRecord(raw)) return null;
			if (raw.type !== "missing_data") return null;
			if (raw.originalIntent !== "reminder.create" && raw.originalIntent !== "chat") return null;
			if (raw.missingField !== "city" && raw.missingField !== "date") return null;
			if (!isRecord(raw.resumePayload)) return null;
			return raw as unknown as MissingDataDialogStateContext;
		},

		matchResponse(messageText, context) {
			const trimmed = messageText.trim();
			if (trimmed.length === 0) return { kind: "no_match" };

			const normalized = normalizeText(messageText);
			const words = normalized.split(" ").filter(Boolean);
			if (words.length === 0) return { kind: "no_match" };

			if (context.missingField === "city") {
				const isCityLike = words.length <= 4 && words.every((word) => /^[a-z]+$/.test(word));
				if (!isCityLike) {
					return { kind: "ambiguous" };
				}
			}

			if (context.missingField === "date") {
				const hasDateSignal =
					/\d/.test(normalized) || dateKeywords.some((keyword) => normalized.includes(keyword));
				if (!hasDateSignal) {
					return { kind: "ambiguous" };
				}
			}

			const decision: MissingDataDecision = { action: "provide_value", valueText: trimmed };
			return {
				kind: "matched",
				decision,
				completionArgs: { userId: "", replyText: messageText, context, decision },
			};
		},

		buildRecentResetHint(context, reason, now) {
			const field = context.missingField === "city" ? "city" : "date";
			return makeHint(
				"missing_data",
				reason,
				now,
				`The question about the missing ${field} has expired.`,
				`I recently asked for a ${field}. Would you like to continue where we left off?`,
			);
		},
	};
}

function createEntityDisambiguationHandler(): DialogStateHandler<
	"entity_disambiguation",
	EntityDisambiguationDialogStateContext,
	EntityDisambiguationDecision,
	DialogStateCompletionArgs<EntityDisambiguationDialogStateContext, EntityDisambiguationDecision>
> {
	return {
		subtype: "entity_disambiguation",
		expectedState: "await",

		parseContext(raw: unknown): EntityDisambiguationDialogStateContext | null {
			if (!isRecord(raw)) return null;
			if (raw.type !== "entity_disambiguation") return null;
			if (!isNonEmptyString(raw.mention)) return null;
			if (!Array.isArray(raw.candidateEntityIds) || raw.candidateEntityIds.length === 0)
				return null;
			if (!raw.candidateEntityIds.every((id: unknown) => isNonEmptyString(id))) return null;
			if (!Array.isArray(raw.candidateOptions)) return null;
			if (!isRecord(raw.pendingFact)) return null;

			if (raw.candidateOptions.length !== raw.candidateEntityIds.length) return null;

			const optionIds = new Set(
				(raw.candidateOptions as Array<Record<string, unknown>>).map((o) => o.entityId),
			);
			for (const id of raw.candidateEntityIds) {
				if (!optionIds.has(id)) return null;
			}

			return raw as unknown as EntityDisambiguationDialogStateContext;
		},

		matchResponse(messageText, context) {
			const norm = normalizeText(messageText);

			for (const option of context.candidateOptions) {
				if (normalizeText(option.label) === norm) {
					const decision: EntityDisambiguationDecision = {
						action: "select_entity",
						entityId: option.entityId,
					};
					return {
						kind: "matched",
						decision,
						completionArgs: { userId: "", replyText: messageText, context, decision },
					};
				}
			}

			const numChoice = Number.parseInt(norm, 10);
			if (
				!Number.isNaN(numChoice) &&
				numChoice >= 1 &&
				numChoice <= context.candidateOptions.length
			) {
				const option = context.candidateOptions[numChoice - 1];
				const decision: EntityDisambiguationDecision = {
					action: "select_entity",
					entityId: option.entityId,
				};
				return {
					kind: "matched",
					decision,
					completionArgs: { userId: "", replyText: messageText, context, decision },
				};
			}

			return { kind: "no_match" };
		},

		buildRecentResetHint(context, reason, now) {
			return makeHint(
				"entity_disambiguation",
				reason,
				now,
				`The question about which "${context.mention}" you meant has expired.`,
				`I recently asked which "${context.mention}" you meant. The fact was not saved. Would you like to try again?`,
			);
		},
	};
}

export function createDialogStateHandlers(): DialogStateHandlerRegistry {
	return {
		conflict: createConflictHandler(),
		delete: createDeleteHandler(),
		account_delete: createAccountDeleteHandler(),
		interest: createInterestHandler(),
		missing_data: createMissingDataHandler(),
		entity_disambiguation: createEntityDisambiguationHandler(),
	};
}

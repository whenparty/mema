import type { Intent } from "@/shared/types";
import type {
	DialogContext,
	DialogDecision,
	DialogStateRecord,
	DialogStateStore,
	RecentResetEntry,
	ResetReason,
} from "./types";
import {
	isBareConfirmation,
	isContinuationIntent,
	isNewIntentFamily,
	isValidStateContextPairing,
} from "./types";

export const DIALOG_TIMEOUT_MS = 30 * 60 * 1000;
export const RECENT_RESET_TTL_MS = 5 * 60 * 1000;

export interface DialogStateManagerDeps {
	readonly store: DialogStateStore;
}

export interface DialogStateManager {
	evaluateInbound(
		userId: string,
		intent: Intent | undefined,
		messageText: string,
		now?: number,
	): Promise<DialogDecision>;
	transitionTo(
		userId: string,
		state: "confirm" | "await",
		context: DialogContext,
		timeoutMs?: number,
	): Promise<void>;
	resetToIdle(userId: string, reason: ResetReason): Promise<void>;
}

export function createDialogStateManager(deps: DialogStateManagerDeps): DialogStateManager {
	const recentResets = new Map<string, RecentResetEntry>();

	function pruneExpiredEntry(userId: string, now: number): void {
		const entry = recentResets.get(userId);
		if (entry && now - entry.resetAt > RECENT_RESET_TTL_MS) {
			recentResets.delete(userId);
		}
	}

	function cacheResetContext(
		userId: string,
		context: DialogContext,
		reason: ResetReason,
		now: number,
	): void {
		recentResets.set(userId, { context, reason, resetAt: now });
	}

	function checkTimeout(record: DialogStateRecord, now: number): boolean {
		if (!record.expiresAt) return false;
		return now >= record.expiresAt.getTime();
	}

	function evaluateOffTopic(intent: Intent | undefined): boolean {
		if (intent === undefined) return false;
		if (isContinuationIntent(intent)) return false;
		return isNewIntentFamily(intent);
	}

	async function handleNonIdleState(
		userId: string,
		record: DialogStateRecord,
		intent: Intent | undefined,
		now: number,
	): Promise<DialogDecision> {
		const context = record.context as DialogContext;

		if (checkTimeout(record, now)) {
			cacheResetContext(userId, context, "timeout", now);
			await deps.store.resetToIdle(userId);
			return {
				kind: "reset_timeout",
				previousState: record.state,
				previousContextType: context.type,
			};
		}

		if (evaluateOffTopic(intent)) {
			cacheResetContext(userId, context, "off_topic", now);
			await deps.store.resetToIdle(userId);
			return {
				kind: "reset_off_topic",
				previousState: record.state,
				previousContextType: context.type,
			};
		}

		return {
			kind: "continue_dialog",
			state: record.state,
			context,
		};
	}

	function handleIdleState(userId: string, messageText: string, now: number): DialogDecision {
		pruneExpiredEntry(userId, now);

		if (isBareConfirmation(messageText)) {
			const entry = recentResets.get(userId);
			if (entry) {
				recentResets.delete(userId);
				return {
					kind: "recover_recent_reset",
					resetContext: entry.context,
					resetReason: entry.reason,
				};
			}
		}

		return { kind: "idle_noop" };
	}

	async function evaluateInbound(
		userId: string,
		intent: Intent | undefined,
		messageText: string,
		now?: number,
	): Promise<DialogDecision> {
		const timestamp = now ?? Date.now();
		const record = await deps.store.load(userId);

		if (!record || record.state === "idle") {
			return handleIdleState(userId, messageText, timestamp);
		}

		if (!record.context || !isValidStateContextPairing(record.state, record.context)) {
			await deps.store.resetToIdle(userId);
			return { kind: "idle_noop" };
		}

		return handleNonIdleState(userId, record, intent, timestamp);
	}

	async function transitionTo(
		userId: string,
		state: "confirm" | "await",
		context: DialogContext,
		timeoutMs?: number,
	): Promise<void> {
		const timeout = timeoutMs ?? DIALOG_TIMEOUT_MS;
		const expiresAt = new Date(Date.now() + timeout);
		await deps.store.upsert(userId, state, context, expiresAt);
	}

	async function resetToIdle(userId: string, reason: ResetReason): Promise<void> {
		const record = await deps.store.load(userId);
		if (record?.context) {
			cacheResetContext(userId, record.context, reason, Date.now());
		}
		await deps.store.resetToIdle(userId);
	}

	return { evaluateInbound, transitionTo, resetToIdle };
}

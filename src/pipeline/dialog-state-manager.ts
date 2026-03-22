import { createChildLogger } from "@/shared/logger";
import type pino from "pino";
import type {
	ActiveDialogState,
	DialogStateContext,
	DialogStateGateDecision,
	DialogStateHandlerRegistry,
	DialogStateHandlerResult,
	DialogStateManager,
	DialogStateManagerDeps,
	DialogStateSubtype,
	OpenDialogStateParams,
	RecentResetHint,
	ScheduledDialogStateRef,
	StoredDialogStateRecord,
} from "./dialog-state-types";
import type { PipelineContext } from "./types";

const DEFAULT_RECENT_RESET_TTL_MS = 5 * 60 * 1000;
const THIRTY_MINUTES_MS = 30 * 60 * 1000;

export function createDialogStateManager(deps: DialogStateManagerDeps): DialogStateManager {
	const {
		store,
		handlers,
		completions,
		classifier,
		scheduler,
		notifier,
		now = () => new Date(),
		recentResetTtlMs = DEFAULT_RECENT_RESET_TTL_MS,
	} = deps;

	const recentHints = new Map<string, RecentResetHint>();
	const timeoutLog = createChildLogger({ module: "dialog-state-timeout" });

	function findHandler(contextType: string) {
		if (contextType in handlers) {
			return handlers[contextType as keyof DialogStateHandlerRegistry];
		}
		return null;
	}

	function isExpired(record: StoredDialogStateRecord): boolean {
		if (!record.expiresAt) return false;
		return now().getTime() >= record.expiresAt.getTime();
	}

	function seedHint(
		userId: string,
		record: StoredDialogStateRecord,
		reason: "timeout" | "off_topic",
	): RecentResetHint | null {
		const ctx = record.context as Record<string, unknown> | null;
		if (!ctx || typeof ctx.type !== "string") return null;

		const handler = findHandler(ctx.type);
		if (!handler) return null;

		const parsed = handler.parseContext(record.context);
		if (!parsed) return null;

		const hint = (
			handler as {
				buildRecentResetHint: (
					c: DialogStateContext,
					r: "timeout" | "off_topic",
					n: Date,
				) => RecentResetHint | null;
			}
		).buildRecentResetHint(parsed, reason, now());
		if (!hint) return null;

		if (recentResetTtlMs <= 0) {
			hint.expiresAt = new Date(now().getTime());
		}

		recentHints.set(userId, hint);
		return hint;
	}

	function getActiveHint(userId: string): RecentResetHint | null {
		const hint = recentHints.get(userId);
		if (!hint) return null;
		if (now().getTime() >= hint.expiresAt.getTime()) {
			recentHints.delete(userId);
			return null;
		}
		return hint;
	}

	function isAllowedReply(text: string, hint: RecentResetHint): boolean {
		const norm = text.trim().toLowerCase();
		return (hint.allowedReplies as readonly string[]).includes(norm);
	}

	async function openState(params: OpenDialogStateParams): Promise<ActiveDialogState | null> {
		if (params.state !== "confirm" && params.state !== "await") {
			throw new Error(`Unsupported dialog state "${params.state}"`);
		}

		const rawContext = params.context as unknown as Record<string, unknown> | null;
		const contextType = rawContext?.type;
		if (typeof contextType !== "string") {
			throw new Error("Dialog state context must include a subtype");
		}

		const handler = findHandler(contextType);
		if (!handler) {
			throw new Error(`Unknown dialog state subtype "${contextType}"`);
		}

		if (handler.expectedState !== params.state) {
			throw new Error(
				`Dialog state subtype "${contextType}" requires state "${handler.expectedState}" but received "${params.state}"`,
			);
		}

		const parsed = handler.parseContext(params.context);
		if (!parsed) {
			throw new Error(`Invalid dialog state context for subtype "${contextType}"`);
		}

		const expiresAt = new Date(params.now.getTime() + THIRTY_MINUTES_MS);

		const result = await store.upsertByExternalUserId({
			externalUserId: params.externalUserId,
			state: params.state,
			context: parsed as unknown as Record<string, unknown>,
			now: params.now,
			expiresAt,
		});

		if (!result) return null;

		const expiresAtResolved = result.expiresAt ?? expiresAt;

		const ref: ScheduledDialogStateRef = {
			userId: result.userId,
			externalUserId: params.externalUserId,
			expectedCreatedAt: result.createdAt,
			expectedExpiresAt: expiresAtResolved,
		};

		scheduler.cancel(result.userId);
		recentHints.delete(result.userId);
		scheduler.schedule(ref, () => handleTimeout(ref, timeoutLog));

		return {
			userId: result.userId,
			state: params.state,
			context: parsed,
			createdAt: result.createdAt,
			expiresAt: expiresAtResolved,
		};
	}

	async function handleTimeout(ref: ScheduledDialogStateRef, log: pino.Logger): Promise<void> {
		const resetResult = await store.compareAndResetByUserId({
			userId: ref.userId,
			expectedCreatedAt: ref.expectedCreatedAt,
			expectedExpiresAt: ref.expectedExpiresAt,
			now: now(),
			reason: "timeout",
		});

		if (resetResult.status !== "reset" || !resetResult.previousState) return;

		const hint = seedHint(ref.userId, resetResult.previousState, "timeout");

		try {
			const timeoutMsg = hint?.timeoutMessage ?? "Your pending question has expired.";
			await notifier.sendTimeoutReset(ref.externalUserId, timeoutMsg);
		} catch (err: unknown) {
			log.warn({ userId: ref.userId }, "timeout notification delivery failed");
		}
	}

	async function evaluateInbound(
		ctx: PipelineContext,
		log: pino.Logger,
	): Promise<DialogStateGateDecision> {
		const externalUserId = ctx.input.externalUserId;
		const lookup = await store.getByExternalUserId(externalUserId);

		if (lookup.userId) {
			ctx.userId = lookup.userId;
		}

		const userId = lookup.userId;
		const record = lookup.dialogState;

		if (!record || record.state === "idle") {
			if (userId) {
				const hint = getActiveHint(userId);
				if (hint && isAllowedReply(ctx.input.text, hint)) {
					return {
						action: "reply_and_stop",
						userId: userId ?? undefined,
						dialogState: null,
						recentResetHint: hint,
						response: hint.recoveryMessage,
					};
				}
			}

			return {
				action: "continue_pipeline",
				userId: userId ?? undefined,
				dialogState: null,
				recentResetHint: null,
			};
		}

		// Active state exists — cancel live timer
		scheduler.cancel(record.userId);

		// Reconcile expiry (missed timer after restart)
		if (isExpired(record)) {
			const resetResult = await store.compareAndResetByUserId({
				userId: record.userId,
				expectedCreatedAt: record.createdAt,
				expectedExpiresAt: record.expiresAt,
				now: now(),
				reason: "timeout",
			});

			let hint: RecentResetHint | null = null;
			if (resetResult.status === "reset" && resetResult.previousState) {
				hint = seedHint(record.userId, resetResult.previousState, "timeout");
			}

			return {
				action: "continue_pipeline",
				userId: userId ?? undefined,
				dialogState: null,
				recentResetHint: hint,
			};
		}

		// Find handler by context.type
		const rawCtx = record.context as Record<string, unknown> | null;
		const contextType = rawCtx?.type as string | undefined;

		if (!contextType) {
			await store.compareAndResetByUserId({
				userId: record.userId,
				expectedCreatedAt: record.createdAt,
				expectedExpiresAt: record.expiresAt,
				now: now(),
				reason: "malformed",
			});
			return {
				action: "continue_pipeline",
				userId: userId ?? undefined,
				dialogState: null,
				recentResetHint: null,
			};
		}

		const handler = findHandler(contextType);
		if (!handler) {
			await store.compareAndResetByUserId({
				userId: record.userId,
				expectedCreatedAt: record.createdAt,
				expectedExpiresAt: record.expiresAt,
				now: now(),
				reason: "malformed",
			});
			return {
				action: "continue_pipeline",
				userId: userId ?? undefined,
				dialogState: null,
				recentResetHint: null,
			};
		}

		if (record.state !== handler.expectedState) {
			await store.compareAndResetByUserId({
				userId: record.userId,
				expectedCreatedAt: record.createdAt,
				expectedExpiresAt: record.expiresAt,
				now: now(),
				reason: "malformed",
			});
			return {
				action: "continue_pipeline",
				userId: userId ?? undefined,
				dialogState: null,
				recentResetHint: null,
			};
		}

		// Parse context
		const parsed = handler.parseContext(record.context);
		if (!parsed) {
			await store.compareAndResetByUserId({
				userId: record.userId,
				expectedCreatedAt: record.createdAt,
				expectedExpiresAt: record.expiresAt,
				now: now(),
				reason: "malformed",
			});
			return {
				action: "continue_pipeline",
				userId: userId ?? undefined,
				dialogState: null,
				recentResetHint: null,
			};
		}

		const activeExpiresAt = record.expiresAt ?? record.createdAt;
		const activeState: ActiveDialogState = {
			userId: record.userId,
			state: record.state as "confirm" | "await",
			context: parsed,
			createdAt: record.createdAt,
			expiresAt: activeExpiresAt,
		};

		// Match response — handler is non-null past the guard above
		const matchFn = handler.matchResponse.bind(handler) as (
			text: string,
			ctx: DialogStateContext,
		) => DialogStateHandlerResult<unknown, unknown>;
		const matchResult = matchFn(ctx.input.text, parsed);

		if (matchResult.kind === "matched") {
			// Completion seam: compare-and-reset → callback → reply_and_stop
			const resetResult = await store.compareAndResetByUserId({
				userId: record.userId,
				expectedCreatedAt: record.createdAt,
				expectedExpiresAt: record.expiresAt,
				now: now(),
				reason: "completed",
			});

			if (resetResult.status !== "reset") {
				return {
					action: "continue_pipeline",
					userId: userId ?? undefined,
					dialogState: null,
					recentResetHint: null,
				};
			}

			const subtype = contextType as DialogStateSubtype;
			const rawArgs = matchResult.completionArgs as Record<string, unknown>;
			const callbackArgs = {
				...rawArgs,
				userId: record.userId,
			};

			try {
				const callbackResult = await (
					completions[subtype] as (args: unknown) => Promise<{ response: string }>
				)(callbackArgs);
				return {
					action: "reply_and_stop",
					userId: userId ?? undefined,
					dialogState: activeState,
					recentResetHint: null,
					response: callbackResult.response,
				};
			} catch (err: unknown) {
				// Reopen and reschedule the same state before rethrowing.
				await openState({
					externalUserId,
					state: activeState.state,
					context: parsed,
					now: now(),
				});
				throw err;
			}
		}

		if (matchResult.kind === "ambiguous") {
			// Consult classifier for ambiguous cases
			try {
				await classifier.classify(ctx.input.text, log, ctx.userId);
			} catch (_err: unknown) {
				// Classifier failure → safe-cancel
			}

			// Always cancel-and-reprocess for ambiguous (classifier never completes a state)
			const resetResult = await store.compareAndResetByUserId({
				userId: record.userId,
				expectedCreatedAt: record.createdAt,
				expectedExpiresAt: record.expiresAt,
				now: now(),
				reason: "off_topic",
			});

			if (resetResult.status === "reset" && resetResult.previousState) {
				seedHint(record.userId, resetResult.previousState, "off_topic");
			}

			return {
				action: "continue_pipeline",
				userId: userId ?? undefined,
				dialogState: null,
				recentResetHint: null,
			};
		}

		// no_match → reset directly
		const resetResult = await store.compareAndResetByUserId({
			userId: record.userId,
			expectedCreatedAt: record.createdAt,
			expectedExpiresAt: record.expiresAt,
			now: now(),
			reason: "off_topic",
		});

		if (resetResult.status === "reset" && resetResult.previousState) {
			seedHint(record.userId, resetResult.previousState, "off_topic");
		}

		return {
			action: "continue_pipeline",
			userId: userId ?? undefined,
			dialogState: null,
			recentResetHint: null,
		};
	}

	return { openState, evaluateInbound, handleTimeout };
}

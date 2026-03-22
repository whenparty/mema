import type { Complexity, Intent } from "@/shared/types";
import type pino from "pino";

export type DialogStateSubtype =
	| "conflict"
	| "delete"
	| "account_delete"
	| "interest"
	| "missing_data"
	| "entity_disambiguation";

export type DialogStateResetReason = "completed" | "timeout" | "off_topic" | "malformed";

export interface ConflictDialogStateContext {
	type: "conflict";
	existingFactId: string;
	existingFactSummary: string;
	pendingFactSummary: string;
	resumePayload: Record<string, unknown>;
}

export interface DeleteDialogStateContext {
	type: "delete";
	deleteMode: "fact" | "entity";
	targetLabel: string;
	factIds?: string[];
	entityId?: string;
	resumePayload: Record<string, unknown>;
}

export interface AccountDeleteDialogStateContext {
	type: "account_delete";
}

export interface InterestDialogStateContext {
	type: "interest";
	candidateId: string;
	topic: string;
	resumePayload: Record<string, unknown>;
}

export interface MissingDataDialogStateContext {
	type: "missing_data";
	originalIntent: "reminder.create" | "chat";
	missingField: "city" | "date";
	resumePayload: Record<string, unknown>;
}

export interface EntityDisambiguationDialogStateContext {
	type: "entity_disambiguation";
	mention: string;
	candidateEntityIds: string[];
	candidateOptions: { entityId: string; label: string }[];
	pendingFact: Record<string, unknown>;
}

export type DialogStateContext =
	| ConflictDialogStateContext
	| DeleteDialogStateContext
	| AccountDeleteDialogStateContext
	| InterestDialogStateContext
	| MissingDataDialogStateContext
	| EntityDisambiguationDialogStateContext;

export interface ActiveDialogState<TContext extends DialogStateContext = DialogStateContext> {
	userId: string;
	state: "confirm" | "await";
	context: TContext;
	createdAt: Date;
	expiresAt: Date;
}

export interface RecentResetHint {
	subtype: DialogStateSubtype;
	reason: "timeout" | "off_topic";
	expiresAt: Date;
	allowedReplies: readonly ("yes" | "no" | "ok")[];
	timeoutMessage: string;
	recoveryMessage: string;
}

export type ConflictDecision =
	| { action: "confirm_update" }
	| { action: "keep_existing" }
	| { action: "coexist" };

export type DeleteDecision = { action: "confirm_delete" } | { action: "cancel_delete" };

export type AccountDeleteDecision =
	| { action: "confirm_delete_account" }
	| { action: "cancel_delete_account" };

export type InterestDecision = { action: "confirm_interest" } | { action: "dismiss_interest" };

export type MissingDataDecision = { action: "provide_value"; valueText: string };

export type EntityDisambiguationDecision = { action: "select_entity"; entityId: string };

export interface DialogStateCompletionArgs<TContext, TDecision> {
	userId: string;
	replyText: string;
	context: TContext;
	decision: TDecision;
}

export interface DialogStateCompletionResult {
	response: string;
}

export type DialogStateHandlerResult<TDecision, TCompletionArgs> =
	| { kind: "matched"; decision: TDecision; completionArgs: TCompletionArgs }
	| { kind: "ambiguous" }
	| { kind: "no_match" };

export interface DialogStateHandler<
	TSubtype extends DialogStateSubtype,
	TContext extends DialogStateContext,
	TDecision,
	TCompletionArgs,
> {
	subtype: TSubtype;
	expectedState: "confirm" | "await";
	parseContext(raw: unknown): TContext | null;
	matchResponse(
		messageText: string,
		context: TContext,
	): DialogStateHandlerResult<TDecision, TCompletionArgs>;
	buildRecentResetHint(
		context: TContext,
		reason: "timeout" | "off_topic",
		now: Date,
	): RecentResetHint | null;
}

export interface DialogStateCompletionCallbacks {
	conflict: (
		args: DialogStateCompletionArgs<ConflictDialogStateContext, ConflictDecision>,
	) => Promise<DialogStateCompletionResult>;
	delete: (
		args: DialogStateCompletionArgs<DeleteDialogStateContext, DeleteDecision>,
	) => Promise<DialogStateCompletionResult>;
	account_delete: (
		args: DialogStateCompletionArgs<AccountDeleteDialogStateContext, AccountDeleteDecision>,
	) => Promise<DialogStateCompletionResult>;
	interest: (
		args: DialogStateCompletionArgs<InterestDialogStateContext, InterestDecision>,
	) => Promise<DialogStateCompletionResult>;
	missing_data: (
		args: DialogStateCompletionArgs<MissingDataDialogStateContext, MissingDataDecision>,
	) => Promise<DialogStateCompletionResult>;
	entity_disambiguation: (
		args: DialogStateCompletionArgs<
			EntityDisambiguationDialogStateContext,
			EntityDisambiguationDecision
		>,
	) => Promise<DialogStateCompletionResult>;
}

type ConflictHandler = DialogStateHandler<
	"conflict",
	ConflictDialogStateContext,
	ConflictDecision,
	DialogStateCompletionArgs<ConflictDialogStateContext, ConflictDecision>
>;

type DeleteHandler = DialogStateHandler<
	"delete",
	DeleteDialogStateContext,
	DeleteDecision,
	DialogStateCompletionArgs<DeleteDialogStateContext, DeleteDecision>
>;

type AccountDeleteHandler = DialogStateHandler<
	"account_delete",
	AccountDeleteDialogStateContext,
	AccountDeleteDecision,
	DialogStateCompletionArgs<AccountDeleteDialogStateContext, AccountDeleteDecision>
>;

type InterestHandler = DialogStateHandler<
	"interest",
	InterestDialogStateContext,
	InterestDecision,
	DialogStateCompletionArgs<InterestDialogStateContext, InterestDecision>
>;

type MissingDataHandler = DialogStateHandler<
	"missing_data",
	MissingDataDialogStateContext,
	MissingDataDecision,
	DialogStateCompletionArgs<MissingDataDialogStateContext, MissingDataDecision>
>;

type EntityDisambiguationHandler = DialogStateHandler<
	"entity_disambiguation",
	EntityDisambiguationDialogStateContext,
	EntityDisambiguationDecision,
	DialogStateCompletionArgs<EntityDisambiguationDialogStateContext, EntityDisambiguationDecision>
>;

export interface DialogStateHandlerRegistry {
	conflict: ConflictHandler;
	delete: DeleteHandler;
	account_delete: AccountDeleteHandler;
	interest: InterestHandler;
	missing_data: MissingDataHandler;
	entity_disambiguation: EntityDisambiguationHandler;
}

export interface ScheduledDialogStateRef {
	userId: string;
	externalUserId: string;
	expectedCreatedAt: Date;
	expectedExpiresAt: Date;
}

export interface DialogStateTimeoutScheduler {
	schedule(ref: ScheduledDialogStateRef, onTimeout: () => Promise<void>): void;
	cancel(userId: string): void;
}

export interface DialogStateTimeoutSchedulerDeps {
	setTimeoutFn?: typeof setTimeout;
	clearTimeoutFn?: typeof clearTimeout;
}

export interface StoredDialogStateRecord {
	userId: string;
	state: "idle" | "confirm" | "await";
	context: unknown;
	createdAt: Date;
	expiresAt: Date | null;
}

export interface DialogStateLookup {
	userId: string | null;
	dialogState: StoredDialogStateRecord | null;
}

export interface DialogStateUpsertParams {
	externalUserId: string;
	state: "confirm" | "await";
	context: Record<string, unknown>;
	now: Date;
	expiresAt: Date;
}

export interface DialogStateResetParams {
	externalUserId: string;
	now: Date;
	reason: DialogStateResetReason;
}

export interface CompareAndResetDialogStateParams {
	userId: string;
	expectedCreatedAt: Date;
	expectedExpiresAt: Date | null;
	now: Date;
	reason: DialogStateResetReason;
}

export interface DialogStateResetResult {
	status: "reset" | "stale" | "already_idle" | "not_found";
	userId: string | null;
	previousState: StoredDialogStateRecord | null;
}

export interface DialogStateStore {
	getByExternalUserId(externalUserId: string): Promise<DialogStateLookup>;
	upsertByExternalUserId(params: DialogStateUpsertParams): Promise<StoredDialogStateRecord | null>;
	resetByExternalUserId(params: DialogStateResetParams): Promise<DialogStateResetResult>;
	compareAndResetByUserId(
		params: CompareAndResetDialogStateParams,
	): Promise<DialogStateResetResult>;
}

export interface DialogStateStorePort {
	getByExternalUserId(externalUserId: string): Promise<DialogStateLookup>;
	upsertByExternalUserId(params: DialogStateUpsertParams): Promise<StoredDialogStateRecord | null>;
	resetByExternalUserId(params: DialogStateResetParams): Promise<DialogStateResetResult>;
	compareAndResetByUserId(
		params: CompareAndResetDialogStateParams,
	): Promise<DialogStateResetResult>;
}

export interface DialogStateClassificationRuntime {
	classify(
		inputText: string,
		log: pino.Logger,
		userId?: string,
	): Promise<{ intent: Intent; complexity: Complexity }>;
}

export interface DialogStateNotifier {
	sendTimeoutReset(externalUserId: string, text: string): Promise<void>;
}

export interface OpenDialogStateParams {
	externalUserId: string;
	state: "confirm" | "await";
	context: DialogStateContext;
	now: Date;
}

export type DialogStateGateDecision =
	| {
			action: "continue_pipeline";
			userId?: string;
			dialogState: ActiveDialogState | null;
			recentResetHint: RecentResetHint | null;
	  }
	| {
			action: "reply_and_stop";
			userId?: string;
			dialogState: ActiveDialogState | null;
			recentResetHint: RecentResetHint | null;
			response: string;
	  };

export interface DialogStateManagerDeps {
	store: DialogStateStorePort;
	handlers: DialogStateHandlerRegistry;
	completions: DialogStateCompletionCallbacks;
	classifier: DialogStateClassificationRuntime;
	scheduler: DialogStateTimeoutScheduler;
	notifier: DialogStateNotifier;
	now?: () => Date;
	recentResetTtlMs?: number;
}

export interface DialogStateManager {
	openState(params: OpenDialogStateParams): Promise<ActiveDialogState | null>;
	evaluateInbound(
		ctx: import("./types").PipelineContext,
		log: pino.Logger,
	): Promise<DialogStateGateDecision>;
	handleTimeout(ref: ScheduledDialogStateRef, log: pino.Logger): Promise<void>;
}

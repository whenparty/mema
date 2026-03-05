import type { Intent } from "@/shared/types";

// --- Dialog States ---

export type DialogState = "idle" | "confirm" | "await";

// --- Discriminated Context Types ---

export interface ConflictContext {
	readonly type: "conflict";
	readonly factId: string;
	readonly existingContent: string;
	readonly newContent: string;
}

export interface DeleteContext {
	readonly type: "delete";
	readonly factId: string;
	readonly factContent: string;
}

export interface AccountDeleteContext {
	readonly type: "account_delete";
}

export interface InterestContext {
	readonly type: "interest";
	readonly candidateIds: readonly string[];
}

export interface MissingDataContext {
	readonly type: "missing_data";
	readonly intent: Intent;
	readonly missingFields: readonly string[];
	readonly partialData: Record<string, unknown>;
}

export interface EntityDisambiguationContext {
	readonly type: "entity_disambiguation";
	readonly entityName: string;
	readonly candidates: readonly EntityCandidate[];
}

export interface EntityCandidate {
	readonly id: string;
	readonly name: string;
	readonly entityType: string;
}

export type DialogContext =
	| ConflictContext
	| DeleteContext
	| AccountDeleteContext
	| InterestContext
	| MissingDataContext
	| EntityDisambiguationContext;

export type DialogContextType = DialogContext["type"];

export const CONFIRM_CONTEXT_TYPES = [
	"conflict",
	"delete",
	"account_delete",
	"interest",
] as const satisfies readonly DialogContextType[];

export const AWAIT_CONTEXT_TYPES = [
	"missing_data",
	"entity_disambiguation",
] as const satisfies readonly DialogContextType[];

// --- Persisted Dialog State Record ---

export interface DialogStateRecord {
	readonly userId: string;
	readonly state: DialogState;
	readonly context: DialogContext | null;
	readonly createdAt: Date;
	readonly expiresAt: Date | null;
}

// --- Decision Outputs ---

export type ResetReason = "timeout" | "off_topic" | "completed" | "invalid_context";

export interface ContinueDialogDecision {
	readonly kind: "continue_dialog";
	readonly state: DialogState;
	readonly context: DialogContext;
}

export interface ResetTimeoutDecision {
	readonly kind: "reset_timeout";
	readonly previousState: DialogState;
	readonly previousContextType: DialogContextType;
}

export interface ResetOffTopicDecision {
	readonly kind: "reset_off_topic";
	readonly previousState: DialogState;
	readonly previousContextType: DialogContextType;
}

export interface IdleNoopDecision {
	readonly kind: "idle_noop";
}

export interface RecoverRecentResetDecision {
	readonly kind: "recover_recent_reset";
	readonly resetContext: DialogContext;
	readonly resetReason: ResetReason;
}

export type DialogDecision =
	| ContinueDialogDecision
	| ResetTimeoutDecision
	| ResetOffTopicDecision
	| IdleNoopDecision
	| RecoverRecentResetDecision;

// --- Recent Reset Cache Entry ---

export interface RecentResetEntry {
	readonly context: DialogContext;
	readonly reason: ResetReason;
	readonly resetAt: number;
}

// --- Persistence Port (domain interface, implemented by infra) ---

export interface DialogStateStore {
	load(userId: string): Promise<DialogStateRecord | null>;
	upsert(
		userId: string,
		state: DialogState,
		context: DialogContext | null,
		expiresAt: Date | null,
	): Promise<void>;
	resetToIdle(userId: string): Promise<void>;
}

// --- Intent Family Helpers ---

const OFF_TOPIC_INTENT_PREFIXES = ["memory.", "reminder.", "system."] as const;

export function isNewIntentFamily(intent: Intent): boolean {
	return OFF_TOPIC_INTENT_PREFIXES.some((prefix) => intent.startsWith(prefix));
}

export function isContinuationIntent(intent: Intent): boolean {
	return intent === "chat";
}

// --- Bare Confirmation Matching ---

const BARE_CONFIRMATION_PATTERNS = /^(yes|no|ok|okay|yep|nope|yeah|nah|sure|cancel|confirm|y|n)$/i;

export function isBareConfirmation(text: string): boolean {
	return BARE_CONFIRMATION_PATTERNS.test(text.trim());
}

// --- Context Validation ---

const confirmContextTypeSet = new Set<string>(CONFIRM_CONTEXT_TYPES);
const awaitContextTypeSet = new Set<string>(AWAIT_CONTEXT_TYPES);

function isRecord(value: unknown): value is Record<string, unknown> {
	return value !== null && typeof value === "object" && !Array.isArray(value);
}

function hasType(obj: Record<string, unknown>): obj is Record<string, unknown> & { type: string } {
	return typeof obj.type === "string";
}

function isStringArray(value: unknown): value is string[] {
	return Array.isArray(value) && value.every((item) => typeof item === "string");
}

function isEntityCandidateArray(value: unknown): value is EntityCandidate[] {
	if (!Array.isArray(value)) return false;
	return value.every(
		(item) =>
			isRecord(item) &&
			typeof item.id === "string" &&
			typeof item.name === "string" &&
			typeof item.entityType === "string",
	);
}

function validateConflictContext(obj: Record<string, unknown>): ConflictContext | null {
	if (
		typeof obj.factId !== "string" ||
		typeof obj.existingContent !== "string" ||
		typeof obj.newContent !== "string"
	) {
		return null;
	}
	return {
		type: "conflict",
		factId: obj.factId,
		existingContent: obj.existingContent,
		newContent: obj.newContent,
	};
}

function validateDeleteContext(obj: Record<string, unknown>): DeleteContext | null {
	if (typeof obj.factId !== "string" || typeof obj.factContent !== "string") {
		return null;
	}
	return { type: "delete", factId: obj.factId, factContent: obj.factContent };
}

function validateAccountDeleteContext(_obj: Record<string, unknown>): AccountDeleteContext {
	return { type: "account_delete" };
}

function validateInterestContext(obj: Record<string, unknown>): InterestContext | null {
	if (!isStringArray(obj.candidateIds)) return null;
	return { type: "interest", candidateIds: obj.candidateIds };
}

function validateMissingDataContext(obj: Record<string, unknown>): MissingDataContext | null {
	if (
		typeof obj.intent !== "string" ||
		!isStringArray(obj.missingFields) ||
		!isRecord(obj.partialData)
	) {
		return null;
	}
	return {
		type: "missing_data",
		intent: obj.intent as Intent,
		missingFields: obj.missingFields,
		partialData: obj.partialData,
	};
}

function validateEntityDisambiguationContext(
	obj: Record<string, unknown>,
): EntityDisambiguationContext | null {
	if (typeof obj.entityName !== "string" || !isEntityCandidateArray(obj.candidates)) {
		return null;
	}
	return {
		type: "entity_disambiguation",
		entityName: obj.entityName,
		candidates: obj.candidates,
	};
}

export function parseDialogContext(raw: unknown): DialogContext | null {
	if (!isRecord(raw) || !hasType(raw)) return null;

	switch (raw.type) {
		case "conflict":
			return validateConflictContext(raw);
		case "delete":
			return validateDeleteContext(raw);
		case "account_delete":
			return validateAccountDeleteContext(raw);
		case "interest":
			return validateInterestContext(raw);
		case "missing_data":
			return validateMissingDataContext(raw);
		case "entity_disambiguation":
			return validateEntityDisambiguationContext(raw);
		default:
			return null;
	}
}

export function isValidStateContextPairing(
	state: DialogState,
	context: DialogContext | null,
): boolean {
	if (state === "idle") return context === null;
	if (context === null) return false;

	if (state === "confirm") return confirmContextTypeSet.has(context.type);
	if (state === "await") return awaitContextTypeSet.has(context.type);

	return false;
}

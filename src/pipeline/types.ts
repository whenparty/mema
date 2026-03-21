import type { Complexity, Intent, MessageInput } from "@/shared/types";
import type pino from "pino";

export type PipelineStepName =
	| "status_check"
	| "rate_limit_check"
	| "token_quota_check"
	| "save_message_received"
	| "extract_facts"
	| "resolve_entities"
	| "detect_conflicts"
	| "store_facts"
	| "classify_intent_and_complexity"
	| "route_intent"
	| "build_context"
	| "generate_response"
	| "update_processing_status";

export type PipelineStep = (ctx: PipelineContext, log: pino.Logger) => Promise<void>;

export interface PipelineSteps {
	statusCheck: PipelineStep;
	rateLimitCheck: PipelineStep;
	tokenQuotaCheck: PipelineStep;
	saveMessageReceived: PipelineStep;
	extractFacts: PipelineStep;
	resolveEntities: PipelineStep;
	detectConflicts: PipelineStep;
	storeFacts: PipelineStep;
	classifyIntentAndComplexity: PipelineStep;
	routeIntent: PipelineStep;
	buildContext: PipelineStep;
	generateResponse: PipelineStep;
	updateProcessingStatus: PipelineStep;
}

interface StepOrderEntry {
	readonly name: PipelineStepName;
	readonly key: keyof PipelineSteps;
}

export const STEP_ORDER: readonly StepOrderEntry[] = [
	{ name: "status_check", key: "statusCheck" },
	{ name: "rate_limit_check", key: "rateLimitCheck" },
	{ name: "token_quota_check", key: "tokenQuotaCheck" },
	{ name: "save_message_received", key: "saveMessageReceived" },
	{ name: "extract_facts", key: "extractFacts" },
	{ name: "resolve_entities", key: "resolveEntities" },
	{ name: "detect_conflicts", key: "detectConflicts" },
	{ name: "store_facts", key: "storeFacts" },
	{ name: "classify_intent_and_complexity", key: "classifyIntentAndComplexity" },
	{ name: "route_intent", key: "routeIntent" },
	{ name: "build_context", key: "buildContext" },
	{ name: "generate_response", key: "generateResponse" },
	{ name: "update_processing_status", key: "updateProcessingStatus" },
] as const;

export interface PipelineContext {
	readonly input: MessageInput;
	userId?: string;
	messageId?: string;
	intent?: Intent;
	complexity?: Complexity;
	extractedFacts?: unknown[];
	resolvedEntities?: unknown[];
	conflicts?: unknown[];
	routeResult?: RouteHandlerKey;
	responseContext?: unknown;
	response?: string;
	earlyResponse?: string;
	error?: unknown;
	stepTimings: Record<string, number>;
}

export type RouteHandlerKey = "chat" | "memory" | "reminder" | "system";

export type RouteHandler = (ctx: PipelineContext, log: pino.Logger) => Promise<void>;

export interface RouteHandlers {
	chat: RouteHandler;
	memory: RouteHandler;
	reminder: RouteHandler;
	system: RouteHandler;
}

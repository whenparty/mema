import type { Complexity, Intent } from "@/shared/types";

export const VALID_INTENTS = [
	"memory.save",
	"memory.view",
	"memory.edit",
	"memory.delete",
	"memory.delete_entity",
	"memory.explain",
	"reminder.create",
	"reminder.list",
	"reminder.cancel",
	"reminder.edit",
	"chat",
	"system.delete_account",
	"system.pause",
	"system.resume",
] as const satisfies readonly Intent[];

export const VALID_COMPLEXITIES = ["trivial", "standard"] as const satisfies readonly Complexity[];

const intentSet = new Set<string>(VALID_INTENTS);
const complexitySet = new Set<string>(VALID_COMPLEXITIES);

export function isValidIntent(value: unknown): value is Intent {
	return typeof value === "string" && intentSet.has(value);
}

export function isValidComplexity(value: unknown): value is Complexity {
	return typeof value === "string" && complexitySet.has(value);
}

export interface ClassificationResult {
	intent: Intent;
	complexity: Complexity;
}

export function validateClassification(raw: unknown): ClassificationResult | null {
	if (raw === null || raw === undefined || typeof raw !== "object" || Array.isArray(raw)) {
		return null;
	}
	const obj = raw as Record<string, unknown>;
	if (!isValidIntent(obj.intent) || !isValidComplexity(obj.complexity)) {
		return null;
	}
	return { intent: obj.intent, complexity: obj.complexity };
}

export function applyComplexityGuardrail(result: ClassificationResult): ClassificationResult {
	if (result.intent !== "chat" && result.complexity !== "standard") {
		return { intent: result.intent, complexity: "standard" };
	}
	return result;
}

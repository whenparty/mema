import type { Complexity, Intent } from "@/shared/types";
import { describe, expect, it } from "vitest";
import {
	type ClassificationResult,
	VALID_COMPLEXITIES,
	VALID_INTENTS,
	applyComplexityGuardrail,
	isValidComplexity,
	isValidIntent,
	validateClassification,
} from "../validate";

describe("VALID_INTENTS", () => {
	it("contains exactly 14 intent values", () => {
		expect(VALID_INTENTS).toHaveLength(14);
	});

	it("includes all memory intents", () => {
		expect(VALID_INTENTS).toContain("memory.save");
		expect(VALID_INTENTS).toContain("memory.view");
		expect(VALID_INTENTS).toContain("memory.edit");
		expect(VALID_INTENTS).toContain("memory.delete");
		expect(VALID_INTENTS).toContain("memory.delete_entity");
		expect(VALID_INTENTS).toContain("memory.explain");
	});

	it("includes all reminder intents", () => {
		expect(VALID_INTENTS).toContain("reminder.create");
		expect(VALID_INTENTS).toContain("reminder.list");
		expect(VALID_INTENTS).toContain("reminder.cancel");
		expect(VALID_INTENTS).toContain("reminder.edit");
	});

	it("includes chat intent", () => {
		expect(VALID_INTENTS).toContain("chat");
	});

	it("includes all system intents", () => {
		expect(VALID_INTENTS).toContain("system.delete_account");
		expect(VALID_INTENTS).toContain("system.pause");
		expect(VALID_INTENTS).toContain("system.resume");
	});
});

describe("VALID_COMPLEXITIES", () => {
	it("contains exactly 2 complexity values", () => {
		expect(VALID_COMPLEXITIES).toHaveLength(2);
	});

	it("includes trivial and standard", () => {
		expect(VALID_COMPLEXITIES).toContain("trivial");
		expect(VALID_COMPLEXITIES).toContain("standard");
	});
});

describe("isValidIntent", () => {
	it("returns true for all 14 valid intents", () => {
		for (const intent of VALID_INTENTS) {
			expect(isValidIntent(intent)).toBe(true);
		}
	});

	it("returns false for empty string", () => {
		expect(isValidIntent("")).toBe(false);
	});

	it("returns false for unknown string", () => {
		expect(isValidIntent("memory.unknown")).toBe(false);
	});

	it("returns false for null", () => {
		expect(isValidIntent(null)).toBe(false);
	});

	it("returns false for undefined", () => {
		expect(isValidIntent(undefined)).toBe(false);
	});

	it("returns false for number", () => {
		expect(isValidIntent(42)).toBe(false);
	});

	it("returns false for object", () => {
		expect(isValidIntent({ intent: "chat" })).toBe(false);
	});
});

describe("isValidComplexity", () => {
	it("returns true for trivial", () => {
		expect(isValidComplexity("trivial")).toBe(true);
	});

	it("returns true for standard", () => {
		expect(isValidComplexity("standard")).toBe(true);
	});

	it("returns false for unknown string", () => {
		expect(isValidComplexity("complex")).toBe(false);
	});

	it("returns false for null", () => {
		expect(isValidComplexity(null)).toBe(false);
	});

	it("returns false for number", () => {
		expect(isValidComplexity(1)).toBe(false);
	});
});

describe("validateClassification", () => {
	it("returns ClassificationResult for valid input", () => {
		const result = validateClassification({ intent: "chat", complexity: "trivial" });
		expect(result).toEqual({ intent: "chat", complexity: "trivial" });
	});

	it("returns ClassificationResult for all intent/complexity combos", () => {
		const result = validateClassification({
			intent: "memory.save",
			complexity: "standard",
		});
		expect(result).toEqual({ intent: "memory.save", complexity: "standard" });
	});

	it("returns null for null input", () => {
		expect(validateClassification(null)).toBeNull();
	});

	it("returns null for undefined input", () => {
		expect(validateClassification(undefined)).toBeNull();
	});

	it("returns null for string input", () => {
		expect(validateClassification("chat")).toBeNull();
	});

	it("returns null for number input", () => {
		expect(validateClassification(42)).toBeNull();
	});

	it("returns null for array input", () => {
		expect(validateClassification(["chat", "trivial"])).toBeNull();
	});

	it("returns null when intent is missing", () => {
		expect(validateClassification({ complexity: "trivial" })).toBeNull();
	});

	it("returns null when complexity is missing", () => {
		expect(validateClassification({ intent: "chat" })).toBeNull();
	});

	it("returns null for invalid intent", () => {
		expect(validateClassification({ intent: "invalid", complexity: "trivial" })).toBeNull();
	});

	it("returns null for invalid complexity", () => {
		expect(validateClassification({ intent: "chat", complexity: "complex" })).toBeNull();
	});

	it("returns null when complexity is null", () => {
		expect(validateClassification({ intent: "chat", complexity: null })).toBeNull();
	});

	it("accepts objects with extra properties", () => {
		const result = validateClassification({
			intent: "chat",
			complexity: "standard",
			confidence: 0.95,
		});
		expect(result).toEqual({ intent: "chat", complexity: "standard" });
	});
});

describe("applyComplexityGuardrail", () => {
	it("keeps trivial for chat intent", () => {
		const input: ClassificationResult = { intent: "chat", complexity: "trivial" };
		const result = applyComplexityGuardrail(input);
		expect(result.complexity).toBe("trivial");
	});

	it("keeps standard for chat intent", () => {
		const input: ClassificationResult = { intent: "chat", complexity: "standard" };
		const result = applyComplexityGuardrail(input);
		expect(result.complexity).toBe("standard");
	});

	it("forces standard for all 13 non-chat intents when trivial", () => {
		const nonChatIntents: Intent[] = [
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
			"system.delete_account",
			"system.pause",
			"system.resume",
		];

		for (const intent of nonChatIntents) {
			const input: ClassificationResult = { intent, complexity: "trivial" };
			const result = applyComplexityGuardrail(input);
			expect(result.complexity).toBe("standard");
			expect(result.intent).toBe(intent);
		}
	});

	it("keeps standard for non-chat intents", () => {
		const input: ClassificationResult = { intent: "memory.save", complexity: "standard" };
		const result = applyComplexityGuardrail(input);
		expect(result.complexity).toBe("standard");
	});

	it("returns same reference when no change is needed for chat/trivial", () => {
		const input: ClassificationResult = { intent: "chat", complexity: "trivial" };
		const result = applyComplexityGuardrail(input);
		expect(result).toBe(input);
	});

	it("returns same reference when no change is needed for non-chat/standard", () => {
		const input: ClassificationResult = { intent: "memory.save", complexity: "standard" };
		const result = applyComplexityGuardrail(input);
		expect(result).toBe(input);
	});

	it("returns new object when guardrail modifies complexity", () => {
		const input: ClassificationResult = { intent: "memory.save", complexity: "trivial" };
		const result = applyComplexityGuardrail(input);
		expect(result).not.toBe(input);
		expect(result).toEqual({ intent: "memory.save", complexity: "standard" });
	});
});

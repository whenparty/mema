import type { Intent } from "@/shared/types";
import { describe, expect, it } from "vitest";
import type { DialogContext, DialogState } from "../types";
import {
	AWAIT_CONTEXT_TYPES,
	CONFIRM_CONTEXT_TYPES,
	isBareConfirmation,
	isContinuationIntent,
	isNewIntentFamily,
	isValidStateContextPairing,
	parseDialogContext,
} from "../types";

// --- Fixtures ---

const VALID_CONFLICT_CONTEXT = {
	type: "conflict",
	factId: "fact-1",
	existingContent: "old",
	newContent: "new",
};

const VALID_DELETE_CONTEXT = {
	type: "delete",
	factId: "fact-2",
	factContent: "some fact",
};

const VALID_ACCOUNT_DELETE_CONTEXT = {
	type: "account_delete",
};

const VALID_INTEREST_CONTEXT = {
	type: "interest",
	candidateIds: ["c1", "c2"],
};

const VALID_MISSING_DATA_CONTEXT = {
	type: "missing_data",
	intent: "reminder.create",
	missingFields: ["date", "time"],
	partialData: { title: "dentist" },
};

const VALID_ENTITY_DISAMBIGUATION_CONTEXT = {
	type: "entity_disambiguation",
	entityName: "John",
	candidates: [
		{ id: "e1", name: "John Smith", entityType: "person" },
		{ id: "e2", name: "John Doe", entityType: "person" },
	],
};

// --- parseDialogContext ---

describe("parseDialogContext", () => {
	describe("valid contexts", () => {
		it("parses conflict context", () => {
			const result = parseDialogContext(VALID_CONFLICT_CONTEXT);
			expect(result).toEqual(VALID_CONFLICT_CONTEXT);
		});

		it("parses delete context", () => {
			const result = parseDialogContext(VALID_DELETE_CONTEXT);
			expect(result).toEqual(VALID_DELETE_CONTEXT);
		});

		it("parses account_delete context", () => {
			const result = parseDialogContext(VALID_ACCOUNT_DELETE_CONTEXT);
			expect(result).toEqual({ type: "account_delete" });
		});

		it("parses interest context", () => {
			const result = parseDialogContext(VALID_INTEREST_CONTEXT);
			expect(result).toEqual(VALID_INTEREST_CONTEXT);
		});

		it("parses missing_data context", () => {
			const result = parseDialogContext(VALID_MISSING_DATA_CONTEXT);
			expect(result).toEqual(VALID_MISSING_DATA_CONTEXT);
		});

		it("parses entity_disambiguation context", () => {
			const result = parseDialogContext(VALID_ENTITY_DISAMBIGUATION_CONTEXT);
			expect(result).toEqual(VALID_ENTITY_DISAMBIGUATION_CONTEXT);
		});
	});

	describe("invalid inputs", () => {
		it("returns null for null", () => {
			expect(parseDialogContext(null)).toBeNull();
		});

		it("returns null for undefined", () => {
			expect(parseDialogContext(undefined)).toBeNull();
		});

		it("returns null for string", () => {
			expect(parseDialogContext("conflict")).toBeNull();
		});

		it("returns null for number", () => {
			expect(parseDialogContext(42)).toBeNull();
		});

		it("returns null for array", () => {
			expect(parseDialogContext([{ type: "conflict" }])).toBeNull();
		});

		it("returns null for empty object", () => {
			expect(parseDialogContext({})).toBeNull();
		});

		it("returns null for object without type field", () => {
			expect(parseDialogContext({ factId: "f1" })).toBeNull();
		});

		it("returns null for object with non-string type", () => {
			expect(parseDialogContext({ type: 123 })).toBeNull();
		});

		it("returns null for unknown context type", () => {
			expect(parseDialogContext({ type: "unknown_type" })).toBeNull();
		});
	});

	describe("malformed context payloads", () => {
		it("returns null for conflict missing factId", () => {
			expect(
				parseDialogContext({ type: "conflict", existingContent: "old", newContent: "new" }),
			).toBeNull();
		});

		it("returns null for conflict with numeric factId", () => {
			expect(
				parseDialogContext({ type: "conflict", factId: 123, existingContent: "old", newContent: "new" }),
			).toBeNull();
		});

		it("returns null for delete missing factContent", () => {
			expect(parseDialogContext({ type: "delete", factId: "f1" })).toBeNull();
		});

		it("returns null for interest with non-array candidateIds", () => {
			expect(parseDialogContext({ type: "interest", candidateIds: "c1" })).toBeNull();
		});

		it("returns null for interest with mixed candidateIds array", () => {
			expect(parseDialogContext({ type: "interest", candidateIds: ["c1", 42] })).toBeNull();
		});

		it("returns null for missing_data with missing intent", () => {
			expect(
				parseDialogContext({
					type: "missing_data",
					missingFields: ["date"],
					partialData: {},
				}),
			).toBeNull();
		});

		it("returns null for missing_data with non-array missingFields", () => {
			expect(
				parseDialogContext({
					type: "missing_data",
					intent: "reminder.create",
					missingFields: "date",
					partialData: {},
				}),
			).toBeNull();
		});

		it("returns null for missing_data with array partialData", () => {
			expect(
				parseDialogContext({
					type: "missing_data",
					intent: "reminder.create",
					missingFields: ["date"],
					partialData: ["invalid"],
				}),
			).toBeNull();
		});

		it("returns null for entity_disambiguation missing entityName", () => {
			expect(
				parseDialogContext({
					type: "entity_disambiguation",
					candidates: [{ id: "e1", name: "John", entityType: "person" }],
				}),
			).toBeNull();
		});

		it("returns null for entity_disambiguation with non-array candidates", () => {
			expect(
				parseDialogContext({
					type: "entity_disambiguation",
					entityName: "John",
					candidates: "not-array",
				}),
			).toBeNull();
		});

		it("returns null for entity_disambiguation with malformed candidate objects", () => {
			expect(
				parseDialogContext({
					type: "entity_disambiguation",
					entityName: "John",
					candidates: [{ id: "e1", name: "John" }],
				}),
			).toBeNull();
		});
	});

	describe("extra properties are tolerated", () => {
		it("account_delete ignores extra properties", () => {
			const result = parseDialogContext({ type: "account_delete", extra: "ignored" });
			expect(result).toEqual({ type: "account_delete" });
		});
	});
});

// --- isValidStateContextPairing ---

describe("isValidStateContextPairing", () => {
	describe("idle state", () => {
		it("idle + null context is valid", () => {
			expect(isValidStateContextPairing("idle", null)).toBe(true);
		});

		it("idle + any context is invalid", () => {
			const context = parseDialogContext(VALID_CONFLICT_CONTEXT) as DialogContext;
			expect(isValidStateContextPairing("idle", context)).toBe(false);
		});
	});

	describe("confirm state", () => {
		const confirmContextFixtures = [
			VALID_CONFLICT_CONTEXT,
			VALID_DELETE_CONTEXT,
			VALID_ACCOUNT_DELETE_CONTEXT,
			VALID_INTEREST_CONTEXT,
		];

		for (const fixture of confirmContextFixtures) {
			it(`confirm + ${fixture.type} context is valid`, () => {
				const context = parseDialogContext(fixture) as DialogContext;
				expect(isValidStateContextPairing("confirm", context)).toBe(true);
			});
		}

		it("confirm + null context is invalid", () => {
			expect(isValidStateContextPairing("confirm", null)).toBe(false);
		});

		it("confirm + missing_data context is invalid (wrong family)", () => {
			const context = parseDialogContext(VALID_MISSING_DATA_CONTEXT) as DialogContext;
			expect(isValidStateContextPairing("confirm", context)).toBe(false);
		});

		it("confirm + entity_disambiguation context is invalid (wrong family)", () => {
			const context = parseDialogContext(VALID_ENTITY_DISAMBIGUATION_CONTEXT) as DialogContext;
			expect(isValidStateContextPairing("confirm", context)).toBe(false);
		});
	});

	describe("await state", () => {
		const awaitContextFixtures = [
			VALID_MISSING_DATA_CONTEXT,
			VALID_ENTITY_DISAMBIGUATION_CONTEXT,
		];

		for (const fixture of awaitContextFixtures) {
			it(`await + ${fixture.type} context is valid`, () => {
				const context = parseDialogContext(fixture) as DialogContext;
				expect(isValidStateContextPairing("await", context)).toBe(true);
			});
		}

		it("await + null context is invalid", () => {
			expect(isValidStateContextPairing("await", null)).toBe(false);
		});

		it("await + conflict context is invalid (wrong family)", () => {
			const context = parseDialogContext(VALID_CONFLICT_CONTEXT) as DialogContext;
			expect(isValidStateContextPairing("await", context)).toBe(false);
		});

		it("await + delete context is invalid (wrong family)", () => {
			const context = parseDialogContext(VALID_DELETE_CONTEXT) as DialogContext;
			expect(isValidStateContextPairing("await", context)).toBe(false);
		});
	});

	describe("context type arrays", () => {
		it("CONFIRM_CONTEXT_TYPES has exactly 4 entries", () => {
			expect(CONFIRM_CONTEXT_TYPES).toHaveLength(4);
		});

		it("AWAIT_CONTEXT_TYPES has exactly 2 entries", () => {
			expect(AWAIT_CONTEXT_TYPES).toHaveLength(2);
		});
	});
});

// --- isNewIntentFamily ---

describe("isNewIntentFamily", () => {
	const memoryIntents: Intent[] = [
		"memory.save",
		"memory.view",
		"memory.edit",
		"memory.delete",
		"memory.delete_entity",
		"memory.explain",
	];

	const reminderIntents: Intent[] = [
		"reminder.create",
		"reminder.list",
		"reminder.cancel",
		"reminder.edit",
	];

	const systemIntents: Intent[] = [
		"system.delete_account",
		"system.pause",
		"system.resume",
	];

	for (const intent of memoryIntents) {
		it(`returns true for ${intent}`, () => {
			expect(isNewIntentFamily(intent)).toBe(true);
		});
	}

	for (const intent of reminderIntents) {
		it(`returns true for ${intent}`, () => {
			expect(isNewIntentFamily(intent)).toBe(true);
		});
	}

	for (const intent of systemIntents) {
		it(`returns true for ${intent}`, () => {
			expect(isNewIntentFamily(intent)).toBe(true);
		});
	}

	it("returns false for chat intent", () => {
		expect(isNewIntentFamily("chat")).toBe(false);
	});
});

// --- isContinuationIntent ---

describe("isContinuationIntent", () => {
	it("returns true for chat", () => {
		expect(isContinuationIntent("chat")).toBe(true);
	});

	it("returns false for memory.save", () => {
		expect(isContinuationIntent("memory.save")).toBe(false);
	});

	it("returns false for reminder.create", () => {
		expect(isContinuationIntent("reminder.create")).toBe(false);
	});

	it("returns false for system.delete_account", () => {
		expect(isContinuationIntent("system.delete_account")).toBe(false);
	});
});

// --- isBareConfirmation ---

describe("isBareConfirmation", () => {
	const bareConfirmations = [
		"yes", "no", "ok", "okay", "yep", "nope",
		"yeah", "nah", "sure", "cancel", "confirm", "y", "n",
	];

	for (const word of bareConfirmations) {
		it(`matches "${word}"`, () => {
			expect(isBareConfirmation(word)).toBe(true);
		});
	}

	it("matches case-insensitively", () => {
		expect(isBareConfirmation("YES")).toBe(true);
		expect(isBareConfirmation("Yes")).toBe(true);
		expect(isBareConfirmation("OK")).toBe(true);
		expect(isBareConfirmation("Confirm")).toBe(true);
	});

	it("trims whitespace", () => {
		expect(isBareConfirmation("  yes  ")).toBe(true);
		expect(isBareConfirmation("\tok\n")).toBe(true);
	});

	it("rejects multi-word sentences", () => {
		expect(isBareConfirmation("yes please")).toBe(false);
	});

	it("rejects normal conversation text", () => {
		expect(isBareConfirmation("I went to the store")).toBe(false);
	});

	it("rejects empty string", () => {
		expect(isBareConfirmation("")).toBe(false);
	});

	it("rejects words that embed confirmation patterns", () => {
		expect(isBareConfirmation("yesterday")).toBe(false);
		expect(isBareConfirmation("nope!")).toBe(false);
	});
});

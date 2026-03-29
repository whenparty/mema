import { describe, expect, it } from "vitest";
import {
	type ExtractedFact,
	VALID_FACT_TYPES,
	VALID_TEMPORAL_SENSITIVITIES,
	isValidFactType,
	isValidTemporalSensitivity,
	validateCombinedExtractionOutput,
} from "../validate";

/** User text that contains the default `source_quote` used in fixtures. */
const USER_TEXT_DEFAULT = "I love Italian food and went to the doctor yesterday";

function baseFact(overrides: Partial<ExtractedFact> = {}): ExtractedFact {
	return {
		content: "Loves Italian food",
		fact_type: "preference",
		event_date: "2026-03-15",
		temporal_sensitivity: "permanent",
		source_quote: "Italian food",
		is_injection_attempt: false,
		...overrides,
	};
}

function minimalTopLevel(overrides: Record<string, unknown> = {}): Record<string, unknown> {
	return {
		facts: [baseFact()],
		entities: [],
		conflicts: [],
		intent: "memory.save",
		complexity: "standard",
		relevant_fact_types: ["preference"],
		...overrides,
	};
}

describe("VALID_FACT_TYPES", () => {
	it("matches FR-MEM.1 / ADR-003 literal set (9 values)", () => {
		expect(VALID_FACT_TYPES).toEqual([
			"location",
			"workplace",
			"relationship",
			"event",
			"preference",
			"health",
			"date",
			"financial",
			"other",
		]);
	});
});

describe("VALID_TEMPORAL_SENSITIVITIES", () => {
	it("lists permanent, long_term, short_term", () => {
		expect(VALID_TEMPORAL_SENSITIVITIES).toEqual(["permanent", "long_term", "short_term"]);
	});
});

describe("isValidFactType", () => {
	it("returns true for every VALID_FACT_TYPES member", () => {
		for (const t of VALID_FACT_TYPES) {
			expect(isValidFactType(t)).toBe(true);
		}
	});

	it("returns false for invalid string", () => {
		expect(isValidFactType("not_a_type")).toBe(false);
	});

	it("returns false for wrong casing", () => {
		expect(isValidFactType("Preference")).toBe(false);
	});

	it("returns false for non-string", () => {
		expect(isValidFactType(null)).toBe(false);
		expect(isValidFactType(1)).toBe(false);
	});
});

describe("isValidTemporalSensitivity", () => {
	it("returns true for each valid literal", () => {
		for (const s of VALID_TEMPORAL_SENSITIVITIES) {
			expect(isValidTemporalSensitivity(s)).toBe(true);
		}
	});

	it("returns false for invalid string", () => {
		expect(isValidTemporalSensitivity("medium_term")).toBe(false);
	});

	it("returns false for non-string", () => {
		expect(isValidTemporalSensitivity(undefined)).toBe(false);
	});
});

describe("validateCombinedExtractionOutput", () => {
	describe("raw shape", () => {
		it("returns null for null", () => {
			expect(validateCombinedExtractionOutput(null, USER_TEXT_DEFAULT)).toBeNull();
		});

		it("returns null for array", () => {
			expect(validateCombinedExtractionOutput([], USER_TEXT_DEFAULT)).toBeNull();
		});

		it("returns null for string", () => {
			expect(validateCombinedExtractionOutput("{}", USER_TEXT_DEFAULT)).toBeNull();
		});
	});

	describe("facts array", () => {
		it("returns empty facts for valid empty facts array (EC2)", () => {
			const raw = minimalTopLevel({ facts: [] });
			expect(validateCombinedExtractionOutput(raw, USER_TEXT_DEFAULT)).toEqual({ facts: [] });
		});

		it("returns null when facts key is missing", () => {
			const { facts: _, ...rest } = minimalTopLevel();
			expect(validateCombinedExtractionOutput(rest, USER_TEXT_DEFAULT)).toBeNull();
		});

		it("returns null when facts is null", () => {
			expect(
				validateCombinedExtractionOutput(minimalTopLevel({ facts: null }), USER_TEXT_DEFAULT),
			).toBeNull();
		});

		it("returns null when facts is not an array", () => {
			expect(
				validateCombinedExtractionOutput(minimalTopLevel({ facts: "nope" }), USER_TEXT_DEFAULT),
			).toBeNull();
		});

		it("returns null when any fact fails — no partial acceptance (R5)", () => {
			const good = baseFact();
			const bad = baseFact({ fact_type: "invalid_type" as ExtractedFact["fact_type"] });
			expect(
				validateCombinedExtractionOutput(
					minimalTopLevel({ facts: [good, bad] }),
					USER_TEXT_DEFAULT,
				),
			).toBeNull();
		});
	});

	describe("unknown top-level keys (A3 / R5)", () => {
		it("ignores unknown keys when facts and siblings are valid", () => {
			const raw = { ...minimalTopLevel(), model_extra: { nested: true }, stray: 1 };
			expect(validateCombinedExtractionOutput(raw, USER_TEXT_DEFAULT)).toEqual({
				facts: [baseFact()],
			});
		});
	});

	describe("relevant_fact_types validate-and-drop (DA2 / EC3)", () => {
		it("returns null when an element is not a valid fact_type (no stripping)", () => {
			const raw = minimalTopLevel({ relevant_fact_types: ["preference", "not_valid"] });
			expect(validateCombinedExtractionOutput(raw, USER_TEXT_DEFAULT)).toBeNull();
		});

		it("treats absent relevant_fact_types as empty (success)", () => {
			const { relevant_fact_types: _, ...raw } = minimalTopLevel();
			expect(validateCombinedExtractionOutput(raw, USER_TEXT_DEFAULT)).toEqual({
				facts: [baseFact()],
			});
		});

		it("treats null relevant_fact_types as empty (success)", () => {
			expect(
				validateCombinedExtractionOutput(
					minimalTopLevel({ relevant_fact_types: null }),
					USER_TEXT_DEFAULT,
				),
			).toEqual({ facts: [baseFact()] });
		});

		it("returns null when relevant_fact_types is not an array", () => {
			expect(
				validateCombinedExtractionOutput(
					minimalTopLevel({ relevant_fact_types: "preference" }),
					USER_TEXT_DEFAULT,
				),
			).toBeNull();
		});
	});

	describe("sibling arrays entities / conflicts (EC5)", () => {
		it("treats absent entities as [] for structural pass", () => {
			const { entities: _, ...raw } = minimalTopLevel();
			expect(validateCombinedExtractionOutput(raw, USER_TEXT_DEFAULT)).toEqual({
				facts: [baseFact()],
			});
		});

		it("treats entities null as []", () => {
			expect(
				validateCombinedExtractionOutput(minimalTopLevel({ entities: null }), USER_TEXT_DEFAULT),
			).toEqual({
				facts: [baseFact()],
			});
		});

		it("returns null when entities is present and not an array", () => {
			expect(
				validateCombinedExtractionOutput(minimalTopLevel({ entities: {} }), USER_TEXT_DEFAULT),
			).toBeNull();
		});

		it("accepts non-empty entities without validating element shapes", () => {
			expect(
				validateCombinedExtractionOutput(
					minimalTopLevel({ entities: [{ anything: true }, null] }),
					USER_TEXT_DEFAULT,
				),
			).toEqual({ facts: [baseFact()] });
		});

		it("returns null when conflicts is not an array", () => {
			expect(
				validateCombinedExtractionOutput(minimalTopLevel({ conflicts: 1 }), USER_TEXT_DEFAULT),
			).toBeNull();
		});
	});

	describe("intent / complexity string-or-absent (EC4)", () => {
		it("allows both keys absent", () => {
			const { intent: _i, complexity: _c, ...raw } = minimalTopLevel();
			expect(validateCombinedExtractionOutput(raw, USER_TEXT_DEFAULT)).toEqual({
				facts: [baseFact()],
			});
		});

		it("returns null when intent is present but not a string", () => {
			expect(
				validateCombinedExtractionOutput(minimalTopLevel({ intent: null }), USER_TEXT_DEFAULT),
			).toBeNull();
		});

		it("returns null when complexity is present but not a string", () => {
			expect(
				validateCombinedExtractionOutput(
					minimalTopLevel({ complexity: ["standard"] }),
					USER_TEXT_DEFAULT,
				),
			).toBeNull();
		});

		it("accepts arbitrary string intent without enum check", () => {
			expect(
				validateCombinedExtractionOutput(
					minimalTopLevel({ intent: "not.a.real.intent" }),
					USER_TEXT_DEFAULT,
				),
			).toEqual({ facts: [baseFact()] });
		});
	});

	describe("per-fact validation", () => {
		it("returns null when fact is not a plain object", () => {
			expect(
				validateCombinedExtractionOutput(minimalTopLevel({ facts: [null] }), USER_TEXT_DEFAULT),
			).toBeNull();
		});

		it("returns null when content is empty after trim", () => {
			expect(
				validateCombinedExtractionOutput(
					minimalTopLevel({ facts: [baseFact({ content: "   " })] }),
					USER_TEXT_DEFAULT,
				),
			).toBeNull();
		});

		it("returns null when source_quote is not a substring of userMessageText (code units, no NFC)", () => {
			expect(
				validateCombinedExtractionOutput(
					minimalTopLevel({ facts: [baseFact({ source_quote: "not in text" })] }),
					USER_TEXT_DEFAULT,
				),
			).toBeNull();
		});

		it("passes when source_quote.trim() is contained in user text", () => {
			const quote = "  doctor yesterday  ";
			expect(USER_TEXT_DEFAULT.includes(quote.trim())).toBe(true);
			expect(
				validateCombinedExtractionOutput(
					minimalTopLevel({ facts: [baseFact({ source_quote: quote })] }),
					USER_TEXT_DEFAULT,
				),
			).toEqual({
				facts: [baseFact({ source_quote: quote })],
			});
		});

		it("returns null for invalid fact_type enum", () => {
			expect(
				validateCombinedExtractionOutput(
					minimalTopLevel({
						facts: [baseFact({ fact_type: "hobby" as ExtractedFact["fact_type"] })],
					}),
					USER_TEXT_DEFAULT,
				),
			).toBeNull();
		});

		it("returns null for invalid temporal_sensitivity", () => {
			expect(
				validateCombinedExtractionOutput(
					minimalTopLevel({
						facts: [
							baseFact({ temporal_sensitivity: "medium" as ExtractedFact["temporal_sensitivity"] }),
						],
					}),
					USER_TEXT_DEFAULT,
				),
			).toBeNull();
		});

		it("returns null when event_date is string with time component", () => {
			expect(
				validateCombinedExtractionOutput(
					minimalTopLevel({ facts: [baseFact({ event_date: "2026-03-15T00:00:00Z" })] }),
					USER_TEXT_DEFAULT,
				),
			).toBeNull();
		});

		it("accepts event_date null", () => {
			expect(
				validateCombinedExtractionOutput(
					minimalTopLevel({ facts: [baseFact({ event_date: null })] }),
					USER_TEXT_DEFAULT,
				),
			).toEqual({ facts: [baseFact({ event_date: null })] });
		});

		it("returns null when is_injection_attempt is not strict boolean (AC6 / EC6)", () => {
			expect(
				validateCombinedExtractionOutput(
					minimalTopLevel({ facts: [baseFact({ is_injection_attempt: 0 as unknown as boolean })] }),
					USER_TEXT_DEFAULT,
				),
			).toBeNull();
		});

		it("keeps facts when is_injection_attempt is true (blocking deferred TASK-5.2+)", () => {
			expect(
				validateCombinedExtractionOutput(
					minimalTopLevel({ facts: [baseFact({ is_injection_attempt: true })] }),
					USER_TEXT_DEFAULT,
				),
			).toEqual({ facts: [baseFact({ is_injection_attempt: true })] });
		});
	});

	describe("US-MEM.1 logical-anchor tier (AC3 / DA3) — shape only in domain", () => {
		it("accepts event_date 2026-03-14 for stubbed model output (pairs with frozen anchor 2026-03-15 in pipeline)", () => {
			const user = "We went to the doctor yesterday";
			const fact = baseFact({
				content: "Doctor visit yesterday",
				fact_type: "health",
				temporal_sensitivity: "short_term",
				source_quote: "doctor yesterday",
				event_date: "2026-03-14",
			});
			expect(validateCombinedExtractionOutput(minimalTopLevel({ facts: [fact] }), user)).toEqual({
				facts: [fact],
			});
		});

		it("accepts event_date equal to anchor fallback when text has no explicit calendar date", () => {
			const user = "I love Italian food";
			const fact = baseFact({
				content: "Loves Italian food",
				source_quote: "Italian food",
				event_date: "2026-03-15",
			});
			expect(validateCombinedExtractionOutput(minimalTopLevel({ facts: [fact] }), user)).toEqual({
				facts: [fact],
			});
		});
	});
});

/**
 * TASK-5.1 — Combined extraction output validation (domain).
 * Treats `LLMResponse.parsed` as untrusted; enforces ADR-003 facts shape, sibling
 * structural rules, and ADR-005 `relevant_fact_types` (validate-and-drop; no return field).
 * `source_quote` is checked as a code-unit substring of `userMessageText` (no Unicode normalization).
 */

const EVENT_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export const VALID_FACT_TYPES = [
	"location",
	"workplace",
	"relationship",
	"event",
	"preference",
	"health",
	"date",
	"financial",
	"other",
] as const satisfies readonly string[];

export type FactType = (typeof VALID_FACT_TYPES)[number];

export const VALID_TEMPORAL_SENSITIVITIES = [
	"permanent",
	"long_term",
	"short_term",
] as const satisfies readonly string[];

export type TemporalSensitivity = (typeof VALID_TEMPORAL_SENSITIVITIES)[number];

export interface ExtractedFact {
	readonly content: string;
	readonly fact_type: FactType;
	readonly event_date: string | null;
	readonly temporal_sensitivity: TemporalSensitivity;
	readonly source_quote: string;
	readonly is_injection_attempt: boolean;
}

const factTypeSet = new Set<string>(VALID_FACT_TYPES);
const temporalSensitivitySet = new Set<string>(VALID_TEMPORAL_SENSITIVITIES);

export function isValidFactType(value: unknown): value is FactType {
	return typeof value === "string" && factTypeSet.has(value);
}

export function isValidTemporalSensitivity(value: unknown): value is TemporalSensitivity {
	return typeof value === "string" && temporalSensitivitySet.has(value);
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
	return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isValidSiblingArrayField(raw: Record<string, unknown>, key: string): boolean {
	if (!Object.prototype.hasOwnProperty.call(raw, key)) {
		return true;
	}
	const value = raw[key];
	if (value === null || value === undefined) {
		return true;
	}
	return Array.isArray(value);
}

function isValidOptionalStringField(raw: Record<string, unknown>, key: string): boolean {
	if (!Object.prototype.hasOwnProperty.call(raw, key)) {
		return true;
	}
	return typeof raw[key] === "string";
}

function isValidRelevantFactTypes(raw: Record<string, unknown>): boolean {
	if (!Object.prototype.hasOwnProperty.call(raw, "relevant_fact_types")) {
		return true;
	}
	const value = raw.relevant_fact_types;
	if (value === null || value === undefined) {
		return true;
	}
	if (!Array.isArray(value)) {
		return false;
	}
	for (const element of value) {
		if (typeof element !== "string" || !isValidFactType(element)) {
			return false;
		}
	}
	return true;
}

function validateOneFact(raw: unknown, userMessageText: string): ExtractedFact | null {
	if (!isPlainObject(raw)) {
		return null;
	}
	const fact = raw;
	if (typeof fact.content !== "string" || fact.content.trim().length < 1) {
		return null;
	}
	if (typeof fact.source_quote !== "string" || fact.source_quote.trim().length < 1) {
		return null;
	}
	if (!userMessageText.includes(fact.source_quote.trim())) {
		return null;
	}
	if (!isValidFactType(fact.fact_type)) {
		return null;
	}
	if (!isValidTemporalSensitivity(fact.temporal_sensitivity)) {
		return null;
	}
	if (fact.is_injection_attempt !== true && fact.is_injection_attempt !== false) {
		return null;
	}
	if (fact.event_date === null) {
		// valid JSON null
	} else if (typeof fact.event_date === "string" && EVENT_DATE_PATTERN.test(fact.event_date)) {
		// valid YYYY-MM-DD
	} else {
		return null;
	}
	return {
		content: fact.content,
		fact_type: fact.fact_type,
		event_date: fact.event_date,
		temporal_sensitivity: fact.temporal_sensitivity,
		source_quote: fact.source_quote,
		is_injection_attempt: fact.is_injection_attempt,
	};
}

export function validateCombinedExtractionOutput(
	raw: unknown,
	userMessageText: string,
): { facts: readonly ExtractedFact[] } | null {
	if (!isPlainObject(raw)) {
		return null;
	}
	if (!Object.prototype.hasOwnProperty.call(raw, "facts")) {
		return null;
	}
	const factsValue = raw.facts;
	if (factsValue === null || !Array.isArray(factsValue)) {
		return null;
	}
	if (!isValidSiblingArrayField(raw, "entities")) {
		return null;
	}
	if (!isValidSiblingArrayField(raw, "conflicts")) {
		return null;
	}
	if (!isValidRelevantFactTypes(raw)) {
		return null;
	}
	if (!isValidOptionalStringField(raw, "intent")) {
		return null;
	}
	if (!isValidOptionalStringField(raw, "complexity")) {
		return null;
	}
	const validatedFacts: ExtractedFact[] = [];
	for (const item of factsValue) {
		const one = validateOneFact(item, userMessageText);
		if (one === null) {
			return null;
		}
		validatedFacts.push(one);
	}
	return { facts: validatedFacts };
}

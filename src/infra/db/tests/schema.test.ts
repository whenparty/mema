import {
	dialogStates,
	entities,
	evaluations,
	factEntities,
	facts,
	interestCandidates,
	interestScans,
	messageUserTelegramIdx,
	messages,
	reminders,
	tokenUsages,
	// Index exports
	userAuthProviderExternalIdx,
	userAuths,
	// Tables
	users,
} from "@/infra/db/schema";
import { describe, expect, it } from "vitest";

describe("schema barrel export", () => {
	it("exports all 12 table objects", () => {
		expect(users).toBeDefined();
		expect(userAuths).toBeDefined();
		expect(messages).toBeDefined();
		expect(facts).toBeDefined();
		expect(entities).toBeDefined();
		expect(factEntities).toBeDefined();
		expect(reminders).toBeDefined();
		expect(dialogStates).toBeDefined();
		expect(evaluations).toBeDefined();
		expect(interestScans).toBeDefined();
		expect(interestCandidates).toBeDefined();
		expect(tokenUsages).toBeDefined();
	});

	it("exports index identifiers", () => {
		expect(userAuthProviderExternalIdx).toBeDefined();
		expect(messageUserTelegramIdx).toBeDefined();
	});
});

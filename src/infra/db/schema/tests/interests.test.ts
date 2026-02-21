import { interestCandidates, interestScans } from "@/infra/db/schema/interests";
import { getTableColumns, getTableName } from "drizzle-orm";
import { describe, expect, it } from "vitest";

describe("interest_scans table", () => {
	it("has table name 'interest_scans'", () => {
		expect(getTableName(interestScans)).toBe("interest_scans");
	});

	it("has correct columns", () => {
		const columns = getTableColumns(interestScans);
		const columnNames = Object.keys(columns);

		expect(columnNames).toContain("userId");
		expect(columnNames).toContain("lastHandledMessageId");
		expect(columnNames).toContain("updatedAt");
		expect(columnNames).toHaveLength(3);
	});

	it("has userId as primary key", () => {
		const columns = getTableColumns(interestScans);
		expect(columns.userId.primary).toBe(true);
	});

	it("has nullable lastHandledMessageId", () => {
		const columns = getTableColumns(interestScans);
		expect(columns.lastHandledMessageId.notNull).toBe(false);
	});

	it("has notNull updatedAt with default", () => {
		const columns = getTableColumns(interestScans);
		expect(columns.updatedAt.notNull).toBe(true);
		expect(columns.updatedAt.hasDefault).toBe(true);
	});
});

describe("interest_candidates table", () => {
	it("has table name 'interest_candidates'", () => {
		expect(getTableName(interestCandidates)).toBe("interest_candidates");
	});

	it("has correct columns", () => {
		const columns = getTableColumns(interestCandidates);
		const columnNames = Object.keys(columns);

		expect(columnNames).toContain("id");
		expect(columnNames).toContain("userId");
		expect(columnNames).toContain("topic");
		expect(columnNames).toContain("mentionCount");
		expect(columnNames).toContain("status");
		expect(columnNames).toContain("firstSeenAt");
		expect(columnNames).toContain("lastSeenAt");
		expect(columnNames).toContain("promotedAt");
		expect(columnNames).toHaveLength(8);
	});

	it("has uuid primary key on id", () => {
		const columns = getTableColumns(interestCandidates);
		expect(columns.id.dataType).toBe("string");
		expect(columns.id.hasDefault).toBe(true);
		expect(columns.id.primary).toBe(true);
	});

	it("has notNull userId, topic, mentionCount, status", () => {
		const columns = getTableColumns(interestCandidates);
		expect(columns.userId.notNull).toBe(true);
		expect(columns.topic.notNull).toBe(true);
		expect(columns.mentionCount.notNull).toBe(true);
		expect(columns.status.notNull).toBe(true);
	});

	it("has mentionCount and status with defaults", () => {
		const columns = getTableColumns(interestCandidates);
		expect(columns.mentionCount.hasDefault).toBe(true);
		expect(columns.status.hasDefault).toBe(true);
	});

	it("has notNull firstSeenAt and lastSeenAt with defaults", () => {
		const columns = getTableColumns(interestCandidates);
		expect(columns.firstSeenAt.notNull).toBe(true);
		expect(columns.firstSeenAt.hasDefault).toBe(true);
		expect(columns.lastSeenAt.notNull).toBe(true);
		expect(columns.lastSeenAt.hasDefault).toBe(true);
	});

	it("has nullable promotedAt", () => {
		const columns = getTableColumns(interestCandidates);
		expect(columns.promotedAt.notNull).toBe(false);
	});
});

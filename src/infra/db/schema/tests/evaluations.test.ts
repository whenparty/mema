import { evaluations } from "@/infra/db/schema/evaluations";
import { getTableColumns, getTableName } from "drizzle-orm";
import { describe, expect, it } from "vitest";

describe("evaluations table", () => {
	it("has table name 'evaluations'", () => {
		expect(getTableName(evaluations)).toBe("evaluations");
	});

	it("has correct columns", () => {
		const columns = getTableColumns(evaluations);
		const columnNames = Object.keys(columns);

		expect(columnNames).toContain("id");
		expect(columnNames).toContain("userId");
		expect(columnNames).toContain("factId");
		expect(columnNames).toContain("messageId");
		expect(columnNames).toContain("evalType");
		expect(columnNames).toContain("verdict");
		expect(columnNames).toContain("reasoning");
		expect(columnNames).toContain("createdAt");
		expect(columnNames).toHaveLength(8);
	});

	it("has uuid primary key on id", () => {
		const columns = getTableColumns(evaluations);
		expect(columns.id.dataType).toBe("string");
		expect(columns.id.hasDefault).toBe(true);
		expect(columns.id.primary).toBe(true);
	});

	it("has notNull userId, messageId, evalType, verdict", () => {
		const columns = getTableColumns(evaluations);
		expect(columns.userId.notNull).toBe(true);
		expect(columns.messageId.notNull).toBe(true);
		expect(columns.evalType.notNull).toBe(true);
		expect(columns.verdict.notNull).toBe(true);
	});

	it("has nullable factId and reasoning", () => {
		const columns = getTableColumns(evaluations);
		expect(columns.factId.notNull).toBe(false);
		expect(columns.reasoning.notNull).toBe(false);
	});

	it("has notNull createdAt with default", () => {
		const columns = getTableColumns(evaluations);
		expect(columns.createdAt.notNull).toBe(true);
		expect(columns.createdAt.hasDefault).toBe(true);
	});
});

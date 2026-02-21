import { tokenUsages } from "@/infra/db/schema/token-usages";
import { getTableColumns, getTableName } from "drizzle-orm";
import { describe, expect, it } from "vitest";

describe("token_usages table", () => {
	it("has table name 'token_usages'", () => {
		expect(getTableName(tokenUsages)).toBe("token_usages");
	});

	it("has correct columns", () => {
		const columns = getTableColumns(tokenUsages);
		const columnNames = Object.keys(columns);

		expect(columnNames).toContain("id");
		expect(columnNames).toContain("userId");
		expect(columnNames).toContain("periodStart");
		expect(columnNames).toContain("tokensUsed");
		expect(columnNames).toContain("quotaLimit");
		expect(columnNames).toContain("updatedAt");
		expect(columnNames).toHaveLength(6);
	});

	it("has uuid primary key on id", () => {
		const columns = getTableColumns(tokenUsages);
		expect(columns.id.dataType).toBe("string");
		expect(columns.id.hasDefault).toBe(true);
		expect(columns.id.primary).toBe(true);
	});

	it("has notNull userId, periodStart, tokensUsed, quotaLimit", () => {
		const columns = getTableColumns(tokenUsages);
		expect(columns.userId.notNull).toBe(true);
		expect(columns.periodStart.notNull).toBe(true);
		expect(columns.tokensUsed.notNull).toBe(true);
		expect(columns.quotaLimit.notNull).toBe(true);
	});

	it("has tokensUsed with default value", () => {
		const columns = getTableColumns(tokenUsages);
		expect(columns.tokensUsed.hasDefault).toBe(true);
	});

	it("has notNull updatedAt with default", () => {
		const columns = getTableColumns(tokenUsages);
		expect(columns.updatedAt.notNull).toBe(true);
		expect(columns.updatedAt.hasDefault).toBe(true);
	});
});

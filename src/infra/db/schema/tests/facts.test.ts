import { facts } from "@/infra/db/schema/facts";
import { getTableColumns, getTableName } from "drizzle-orm";
import { describe, expect, it } from "vitest";

describe("facts table", () => {
	it("has table name 'facts'", () => {
		expect(getTableName(facts)).toBe("facts");
	});

	it("has correct columns", () => {
		const columns = getTableColumns(facts);
		const columnNames = Object.keys(columns);

		expect(columnNames).toContain("id");
		expect(columnNames).toContain("userId");
		expect(columnNames).toContain("factType");
		expect(columnNames).toContain("content");
		expect(columnNames).toContain("embedding");
		expect(columnNames).toContain("eventDate");
		expect(columnNames).toContain("temporalSensitivity");
		expect(columnNames).toContain("sourceQuote");
		expect(columnNames).toContain("sourceMessageId");
		expect(columnNames).toContain("status");
		expect(columnNames).toContain("previousVersionId");
		expect(columnNames).toContain("createdAt");
		expect(columnNames).toHaveLength(12);
	});

	it("has uuid primary key on id", () => {
		const columns = getTableColumns(facts);
		expect(columns.id.dataType).toBe("string");
		expect(columns.id.hasDefault).toBe(true);
		expect(columns.id.primary).toBe(true);
	});

	it("has notNull userId, factType, content, eventDate, temporalSensitivity", () => {
		const columns = getTableColumns(facts);
		expect(columns.userId.notNull).toBe(true);
		expect(columns.factType.notNull).toBe(true);
		expect(columns.content.notNull).toBe(true);
		expect(columns.eventDate.notNull).toBe(true);
		expect(columns.temporalSensitivity.notNull).toBe(true);
	});

	it("has nullable embedding, sourceQuote, sourceMessageId, previousVersionId", () => {
		const columns = getTableColumns(facts);
		expect(columns.embedding.notNull).toBe(false);
		expect(columns.sourceQuote.notNull).toBe(false);
		expect(columns.sourceMessageId.notNull).toBe(false);
		expect(columns.previousVersionId.notNull).toBe(false);
	});

	it("has status with default value and notNull", () => {
		const columns = getTableColumns(facts);
		expect(columns.status.notNull).toBe(true);
		expect(columns.status.hasDefault).toBe(true);
	});

	it("has notNull createdAt with default", () => {
		const columns = getTableColumns(facts);
		expect(columns.createdAt.notNull).toBe(true);
		expect(columns.createdAt.hasDefault).toBe(true);
	});

	it("has embedding column with custom type", () => {
		const columns = getTableColumns(facts);
		expect(columns.embedding.columnType).toBe("PgVector");
	});
});

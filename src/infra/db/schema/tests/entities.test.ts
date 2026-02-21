import { entities, factEntities } from "@/infra/db/schema/entities";
import { getTableColumns, getTableName } from "drizzle-orm";
import { describe, expect, it } from "vitest";

describe("entities table", () => {
	it("has table name 'entities'", () => {
		expect(getTableName(entities)).toBe("entities");
	});

	it("has correct columns", () => {
		const columns = getTableColumns(entities);
		const columnNames = Object.keys(columns);

		expect(columnNames).toContain("id");
		expect(columnNames).toContain("userId");
		expect(columnNames).toContain("canonicalName");
		expect(columnNames).toContain("aliases");
		expect(columnNames).toContain("type");
		expect(columnNames).toContain("description");
		expect(columnNames).toContain("createdAt");
		expect(columnNames).toContain("updatedAt");
		expect(columnNames).toHaveLength(8);
	});

	it("has uuid primary key on id", () => {
		const columns = getTableColumns(entities);
		expect(columns.id.dataType).toBe("string");
		expect(columns.id.hasDefault).toBe(true);
		expect(columns.id.primary).toBe(true);
	});

	it("has notNull userId, canonicalName, type", () => {
		const columns = getTableColumns(entities);
		expect(columns.userId.notNull).toBe(true);
		expect(columns.canonicalName.notNull).toBe(true);
		expect(columns.type.notNull).toBe(true);
	});

	it("has nullable description", () => {
		const columns = getTableColumns(entities);
		expect(columns.description.notNull).toBe(false);
	});

	it("has aliases with default value", () => {
		const columns = getTableColumns(entities);
		expect(columns.aliases.hasDefault).toBe(true);
	});

	it("has notNull created_at and updated_at with defaults", () => {
		const columns = getTableColumns(entities);
		expect(columns.createdAt.notNull).toBe(true);
		expect(columns.createdAt.hasDefault).toBe(true);
		expect(columns.updatedAt.notNull).toBe(true);
		expect(columns.updatedAt.hasDefault).toBe(true);
	});
});

describe("fact_entities table", () => {
	it("has table name 'fact_entities'", () => {
		expect(getTableName(factEntities)).toBe("fact_entities");
	});

	it("has correct columns", () => {
		const columns = getTableColumns(factEntities);
		const columnNames = Object.keys(columns);

		expect(columnNames).toContain("factId");
		expect(columnNames).toContain("entityId");
		expect(columnNames).toHaveLength(2);
	});

	it("has notNull factId and entityId", () => {
		const columns = getTableColumns(factEntities);
		expect(columns.factId.notNull).toBe(true);
		expect(columns.entityId.notNull).toBe(true);
	});
});

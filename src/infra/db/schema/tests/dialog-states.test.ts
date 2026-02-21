import { dialogStates } from "@/infra/db/schema/dialog-states";
import { getTableColumns, getTableName } from "drizzle-orm";
import { describe, expect, it } from "vitest";

describe("dialog_states table", () => {
	it("has table name 'dialog_states'", () => {
		expect(getTableName(dialogStates)).toBe("dialog_states");
	});

	it("has correct columns", () => {
		const columns = getTableColumns(dialogStates);
		const columnNames = Object.keys(columns);

		expect(columnNames).toContain("userId");
		expect(columnNames).toContain("state");
		expect(columnNames).toContain("context");
		expect(columnNames).toContain("createdAt");
		expect(columnNames).toContain("expiresAt");
		expect(columnNames).toHaveLength(5);
	});

	it("has userId as primary key", () => {
		const columns = getTableColumns(dialogStates);
		expect(columns.userId.primary).toBe(true);
	});

	it("has notNull state with default", () => {
		const columns = getTableColumns(dialogStates);
		expect(columns.state.notNull).toBe(true);
		expect(columns.state.hasDefault).toBe(true);
	});

	it("has nullable context and expiresAt", () => {
		const columns = getTableColumns(dialogStates);
		expect(columns.context.notNull).toBe(false);
		expect(columns.expiresAt.notNull).toBe(false);
	});

	it("has notNull createdAt with default", () => {
		const columns = getTableColumns(dialogStates);
		expect(columns.createdAt.notNull).toBe(true);
		expect(columns.createdAt.hasDefault).toBe(true);
	});
});

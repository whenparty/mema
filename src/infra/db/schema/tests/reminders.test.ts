import { reminders } from "@/infra/db/schema/reminders";
import { getTableColumns, getTableName } from "drizzle-orm";
import { describe, expect, it } from "vitest";

describe("reminders table", () => {
	it("has table name 'reminders'", () => {
		expect(getTableName(reminders)).toBe("reminders");
	});

	it("has correct columns", () => {
		const columns = getTableColumns(reminders);
		const columnNames = Object.keys(columns);

		expect(columnNames).toContain("id");
		expect(columnNames).toContain("userId");
		expect(columnNames).toContain("entityId");
		expect(columnNames).toContain("text");
		expect(columnNames).toContain("reminderType");
		expect(columnNames).toContain("nextTriggerAt");
		expect(columnNames).toContain("schedule");
		expect(columnNames).toContain("status");
		expect(columnNames).toContain("createdAt");
		expect(columnNames).toContain("updatedAt");
		expect(columnNames).toHaveLength(10);
	});

	it("has uuid primary key on id", () => {
		const columns = getTableColumns(reminders);
		expect(columns.id.dataType).toBe("string");
		expect(columns.id.hasDefault).toBe(true);
		expect(columns.id.primary).toBe(true);
	});

	it("has notNull userId, text, reminderType, nextTriggerAt, status", () => {
		const columns = getTableColumns(reminders);
		expect(columns.userId.notNull).toBe(true);
		expect(columns.text.notNull).toBe(true);
		expect(columns.reminderType.notNull).toBe(true);
		expect(columns.nextTriggerAt.notNull).toBe(true);
		expect(columns.status.notNull).toBe(true);
	});

	it("has nullable entityId and schedule", () => {
		const columns = getTableColumns(reminders);
		expect(columns.entityId.notNull).toBe(false);
		expect(columns.schedule.notNull).toBe(false);
	});

	it("has status with default value", () => {
		const columns = getTableColumns(reminders);
		expect(columns.status.hasDefault).toBe(true);
	});

	it("has notNull created_at and updated_at with defaults", () => {
		const columns = getTableColumns(reminders);
		expect(columns.createdAt.notNull).toBe(true);
		expect(columns.createdAt.hasDefault).toBe(true);
		expect(columns.updatedAt.notNull).toBe(true);
		expect(columns.updatedAt.hasDefault).toBe(true);
	});
});

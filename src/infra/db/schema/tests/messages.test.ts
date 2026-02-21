import { messageUserTelegramIdx, messages } from "@/infra/db/schema/messages";
import { getTableColumns, getTableName } from "drizzle-orm";
import { describe, expect, it } from "vitest";

describe("messages table", () => {
	it("has table name 'messages'", () => {
		expect(getTableName(messages)).toBe("messages");
	});

	it("has correct columns", () => {
		const columns = getTableColumns(messages);
		const columnNames = Object.keys(columns);

		expect(columnNames).toContain("id");
		expect(columnNames).toContain("userId");
		expect(columnNames).toContain("role");
		expect(columnNames).toContain("content");
		expect(columnNames).toContain("processingStatus");
		expect(columnNames).toContain("telegramUpdateId");
		expect(columnNames).toContain("createdAt");
		expect(columnNames).toHaveLength(7);
	});

	it("has uuid primary key on id", () => {
		const columns = getTableColumns(messages);
		expect(columns.id.dataType).toBe("string");
		expect(columns.id.hasDefault).toBe(true);
		expect(columns.id.primary).toBe(true);
	});

	it("has notNull userId, role, content, processingStatus", () => {
		const columns = getTableColumns(messages);
		expect(columns.userId.notNull).toBe(true);
		expect(columns.role.notNull).toBe(true);
		expect(columns.content.notNull).toBe(true);
		expect(columns.processingStatus.notNull).toBe(true);
	});

	it("has processingStatus with default value", () => {
		const columns = getTableColumns(messages);
		expect(columns.processingStatus.hasDefault).toBe(true);
	});

	it("has nullable telegramUpdateId", () => {
		const columns = getTableColumns(messages);
		expect(columns.telegramUpdateId.notNull).toBe(false);
	});

	it("has notNull createdAt with default", () => {
		const columns = getTableColumns(messages);
		expect(columns.createdAt.notNull).toBe(true);
		expect(columns.createdAt.hasDefault).toBe(true);
	});

	it("exports unique index on user_id + telegram_update_id", () => {
		expect(messageUserTelegramIdx).toBeDefined();
	});
});

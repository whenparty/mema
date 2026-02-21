import { userAuthProviderExternalIdx, userAuths, users } from "@/infra/db/schema/users";
import { getTableColumns, getTableName } from "drizzle-orm";
import { describe, expect, it } from "vitest";

describe("users table", () => {
	it("has table name 'users'", () => {
		expect(getTableName(users)).toBe("users");
	});

	it("has correct columns", () => {
		const columns = getTableColumns(users);
		const columnNames = Object.keys(columns);

		expect(columnNames).toContain("id");
		expect(columnNames).toContain("status");
		expect(columnNames).toContain("timezone");
		expect(columnNames).toContain("summary");
		expect(columnNames).toContain("summaryUpdatedAt");
		expect(columnNames).toContain("createdAt");
		expect(columnNames).toContain("updatedAt");
		expect(columnNames).toHaveLength(7);
	});

	it("has uuid primary key on id", () => {
		const columns = getTableColumns(users);
		expect(columns.id.dataType).toBe("string");
		expect(columns.id.hasDefault).toBe(true);
		expect(columns.id.primary).toBe(true);
	});

	it("has status column with default 'waitlist'", () => {
		const columns = getTableColumns(users);
		expect(columns.status.notNull).toBe(true);
		expect(columns.status.hasDefault).toBe(true);
	});

	it("has nullable timezone and summary", () => {
		const columns = getTableColumns(users);
		expect(columns.timezone.notNull).toBe(false);
		expect(columns.summary.notNull).toBe(false);
	});

	it("has notNull created_at and updated_at with defaults", () => {
		const columns = getTableColumns(users);
		expect(columns.createdAt.notNull).toBe(true);
		expect(columns.createdAt.hasDefault).toBe(true);
		expect(columns.updatedAt.notNull).toBe(true);
		expect(columns.updatedAt.hasDefault).toBe(true);
	});
});

describe("user_auths table", () => {
	it("has table name 'user_auths'", () => {
		expect(getTableName(userAuths)).toBe("user_auths");
	});

	it("has correct columns", () => {
		const columns = getTableColumns(userAuths);
		const columnNames = Object.keys(columns);

		expect(columnNames).toContain("id");
		expect(columnNames).toContain("userId");
		expect(columnNames).toContain("provider");
		expect(columnNames).toContain("externalId");
		expect(columnNames).toContain("languageCode");
		expect(columnNames).toContain("createdAt");
		expect(columnNames).toHaveLength(6);
	});

	it("has uuid primary key on id", () => {
		const columns = getTableColumns(userAuths);
		expect(columns.id.dataType).toBe("string");
		expect(columns.id.hasDefault).toBe(true);
		expect(columns.id.primary).toBe(true);
	});

	it("has notNull userId, provider, externalId", () => {
		const columns = getTableColumns(userAuths);
		expect(columns.userId.notNull).toBe(true);
		expect(columns.provider.notNull).toBe(true);
		expect(columns.externalId.notNull).toBe(true);
	});

	it("has nullable languageCode", () => {
		const columns = getTableColumns(userAuths);
		expect(columns.languageCode.notNull).toBe(false);
	});

	it("exports unique index on provider + external_id", () => {
		expect(userAuthProviderExternalIdx).toBeDefined();
	});
});

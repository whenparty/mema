import { pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";

export type UserStatus = "waitlist" | "active" | "paused" | "blocked";

export const users = pgTable("users", {
	id: uuid("id").defaultRandom().primaryKey(),
	status: text("status").notNull().default("waitlist").$type<UserStatus>(),
	timezone: text("timezone"),
	summary: text("summary"),
	summaryUpdatedAt: timestamp("summary_updated_at", { withTimezone: true }),
	createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
	updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export type AuthProvider = "telegram";

export const userAuths = pgTable(
	"user_auths",
	{
		id: uuid("id").defaultRandom().primaryKey(),
		userId: uuid("user_id")
			.notNull()
			.references(() => users.id),
		provider: text("provider").notNull().$type<AuthProvider>(),
		externalId: text("external_id").notNull(),
		languageCode: text("language_code"),
		createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
	},
	(table) => [
		uniqueIndex("user_auths_provider_external_id_idx").on(table.provider, table.externalId),
	],
);

export const userAuthProviderExternalIdx = "user_auths_provider_external_id_idx";

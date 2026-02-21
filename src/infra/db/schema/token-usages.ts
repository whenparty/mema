import { date, integer, pgTable, timestamp, uuid } from "drizzle-orm/pg-core";
import { users } from "./users";

export const tokenUsages = pgTable("token_usages", {
	id: uuid("id").defaultRandom().primaryKey(),
	userId: uuid("user_id")
		.notNull()
		.references(() => users.id),
	periodStart: date("period_start", { mode: "date" }).notNull(),
	tokensUsed: integer("tokens_used").notNull().default(0),
	quotaLimit: integer("quota_limit").notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

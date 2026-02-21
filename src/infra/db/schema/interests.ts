import { integer, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { messages } from "./messages";
import { users } from "./users";

export const interestScans = pgTable("interest_scans", {
	userId: uuid("user_id")
		.primaryKey()
		.references(() => users.id),
	lastHandledMessageId: uuid("last_handled_message_id").references(() => messages.id),
	updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export type InterestCandidateStatus = "tracking" | "promoted" | "confirmed" | "dismissed";

export const interestCandidates = pgTable("interest_candidates", {
	id: uuid("id").defaultRandom().primaryKey(),
	userId: uuid("user_id")
		.notNull()
		.references(() => users.id),
	topic: text("topic").notNull(),
	mentionCount: integer("mention_count").notNull().default(1),
	status: text("status").notNull().default("tracking").$type<InterestCandidateStatus>(),
	firstSeenAt: timestamp("first_seen_at", { withTimezone: true }).notNull().defaultNow(),
	lastSeenAt: timestamp("last_seen_at", { withTimezone: true }).notNull().defaultNow(),
	promotedAt: timestamp("promoted_at", { withTimezone: true }),
});

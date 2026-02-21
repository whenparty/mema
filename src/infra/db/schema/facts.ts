import {
	type AnyPgColumn,
	date,
	pgTable,
	text,
	timestamp,
	uuid,
	vector,
} from "drizzle-orm/pg-core";
import { messages } from "./messages";
import { users } from "./users";

export type FactType =
	| "location"
	| "workplace"
	| "relationship"
	| "event"
	| "preference"
	| "health"
	| "date"
	| "financial"
	| "other";

export type TemporalSensitivity = "permanent" | "long_term" | "short_term";

export type FactStatus = "active" | "outdated";

export const facts = pgTable("facts", {
	id: uuid("id").defaultRandom().primaryKey(),
	userId: uuid("user_id")
		.notNull()
		.references(() => users.id),
	factType: text("fact_type").notNull().$type<FactType>(),
	content: text("content").notNull(),
	embedding: vector("embedding", { dimensions: 1536 }),
	eventDate: date("event_date", { mode: "date" }).notNull(),
	temporalSensitivity: text("temporal_sensitivity").notNull().$type<TemporalSensitivity>(),
	sourceQuote: text("source_quote"),
	sourceMessageId: uuid("source_message_id").references(() => messages.id),
	status: text("status").notNull().default("active").$type<FactStatus>(),
	previousVersionId: uuid("previous_version_id").references((): AnyPgColumn => facts.id),
	createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

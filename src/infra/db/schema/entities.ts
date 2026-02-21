import { jsonb, pgTable, primaryKey, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { facts } from "./facts";
import { users } from "./users";

export type EntityType = "person" | "place" | "organization" | "other";

export const entities = pgTable("entities", {
	id: uuid("id").defaultRandom().primaryKey(),
	userId: uuid("user_id")
		.notNull()
		.references(() => users.id),
	canonicalName: text("canonical_name").notNull(),
	aliases: jsonb("aliases").$type<string[]>().default([]),
	type: text("type").notNull().$type<EntityType>(),
	description: text("description"),
	createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
	updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const factEntities = pgTable(
	"fact_entities",
	{
		factId: uuid("fact_id")
			.notNull()
			.references(() => facts.id),
		entityId: uuid("entity_id")
			.notNull()
			.references(() => entities.id),
	},
	(table) => [primaryKey({ columns: [table.factId, table.entityId] })],
);

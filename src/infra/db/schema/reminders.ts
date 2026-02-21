import { pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { entities } from "./entities";
import { users } from "./users";

export type ReminderType = "one_time" | "recurring";

export type ReminderStatus = "active" | "delivered" | "cancelled";

export const reminders = pgTable("reminders", {
	id: uuid("id").defaultRandom().primaryKey(),
	userId: uuid("user_id")
		.notNull()
		.references(() => users.id),
	entityId: uuid("entity_id").references(() => entities.id),
	text: text("text").notNull(),
	reminderType: text("reminder_type").notNull().$type<ReminderType>(),
	nextTriggerAt: timestamp("next_trigger_at", { withTimezone: true }).notNull(),
	schedule: text("schedule"),
	status: text("status").notNull().default("active").$type<ReminderStatus>(),
	createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
	updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

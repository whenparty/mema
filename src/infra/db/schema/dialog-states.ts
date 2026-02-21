import { jsonb, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { users } from "./users";

export type DialogStateType = "idle" | "confirm" | "await";

export const dialogStates = pgTable("dialog_states", {
	userId: uuid("user_id")
		.primaryKey()
		.references(() => users.id),
	state: text("state").notNull().default("idle").$type<DialogStateType>(),
	context: jsonb("context"),
	createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
	expiresAt: timestamp("expires_at", { withTimezone: true }),
});

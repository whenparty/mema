import { pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { facts } from "./facts";
import { messages } from "./messages";
import { users } from "./users";

export type EvalType = "extraction_accuracy" | "application_relevance";

export type EvalVerdict = "correct" | "incorrect" | "partial";

export const evaluations = pgTable("evaluations", {
	id: uuid("id").defaultRandom().primaryKey(),
	userId: uuid("user_id")
		.notNull()
		.references(() => users.id),
	factId: uuid("fact_id").references(() => facts.id),
	messageId: uuid("message_id")
		.notNull()
		.references(() => messages.id),
	evalType: text("eval_type").notNull().$type<EvalType>(),
	verdict: text("verdict").notNull().$type<EvalVerdict>(),
	reasoning: text("reasoning"),
	createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

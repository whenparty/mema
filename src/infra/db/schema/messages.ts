import { pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { users } from "./users";

export type MessageRole = "user" | "bot";

export type ProcessingStatus = "received" | "processed" | "failed";

export const messages = pgTable(
	"messages",
	{
		id: uuid("id").defaultRandom().primaryKey(),
		userId: uuid("user_id")
			.notNull()
			.references(() => users.id),
		role: text("role").notNull().$type<MessageRole>(),
		content: text("content").notNull(),
		processingStatus: text("processing_status")
			.notNull()
			.default("received")
			.$type<ProcessingStatus>(),
		telegramUpdateId: text("telegram_update_id"),
		createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
	},
	(table) => [
		uniqueIndex("messages_user_telegram_update_idx").on(table.userId, table.telegramUpdateId),
	],
);

export const messageUserTelegramIdx = "messages_user_telegram_update_idx";

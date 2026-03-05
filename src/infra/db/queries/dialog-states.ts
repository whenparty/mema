import type { DialogContext, DialogState, DialogStateRecord, DialogStateStore } from "@/domain/dialog/types";
import { parseDialogContext } from "@/domain/dialog/types";
import { eq } from "drizzle-orm";
import type { DbClient } from "../client";
import { dialogStates } from "../schema/dialog-states";

function decodeRecord(row: typeof dialogStates.$inferSelect): DialogStateRecord {
	const context = row.context !== null ? parseDialogContext(row.context) : null;

	return {
		userId: row.userId,
		state: row.state,
		context,
		createdAt: row.createdAt,
		expiresAt: row.expiresAt,
	};
}

export function createDialogStateStore(db: DbClient): DialogStateStore {
	return {
		async load(userId: string): Promise<DialogStateRecord | null> {
			const rows = await db.select().from(dialogStates).where(eq(dialogStates.userId, userId));

			if (rows.length === 0) return null;
			return decodeRecord(rows[0]);
		},

		async upsert(
			userId: string,
			state: DialogState,
			context: DialogContext | null,
			expiresAt: Date | null,
		): Promise<void> {
			await db
				.insert(dialogStates)
				.values({
					userId,
					state: state as typeof dialogStates.$inferInsert.state,
					context: context as unknown as Record<string, unknown>,
					createdAt: new Date(),
					expiresAt,
				})
				.onConflictDoUpdate({
					target: dialogStates.userId,
					set: {
						state: state as typeof dialogStates.$inferInsert.state,
						context: context as unknown as Record<string, unknown>,
						createdAt: new Date(),
						expiresAt,
					},
				});
		},

		async resetToIdle(userId: string): Promise<void> {
			await db
				.insert(dialogStates)
				.values({
					userId,
					state: "idle",
					context: null,
					createdAt: new Date(),
					expiresAt: null,
				})
				.onConflictDoUpdate({
					target: dialogStates.userId,
					set: {
						state: "idle",
						context: null,
						createdAt: new Date(),
						expiresAt: null,
					},
				});
		},
	};
}

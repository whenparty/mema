import { and, eq, isNull } from "drizzle-orm";
import type { DbClient } from "../client";
import { dialogStates } from "../schema/dialog-states";
import { userAuths } from "../schema/users";

export interface DialogStateStore {
	getByExternalUserId(
		externalUserId: string,
	): Promise<{ userId: string | null; dialogState: StoredDialogStateRecord | null }>;
	upsertByExternalUserId(params: DialogStateUpsertParams): Promise<StoredDialogStateRecord | null>;
	resetByExternalUserId(params: DialogStateResetParams): Promise<DialogStateResetResult>;
	compareAndResetByUserId(
		params: CompareAndResetDialogStateParams,
	): Promise<DialogStateResetResult>;
}

export interface StoredDialogStateRecord {
	userId: string;
	state: "idle" | "confirm" | "await";
	context: unknown;
	createdAt: Date;
	expiresAt: Date | null;
}

export interface DialogStateUpsertParams {
	externalUserId: string;
	state: "confirm" | "await";
	context: Record<string, unknown>;
	now: Date;
	expiresAt: Date;
}

export interface DialogStateResetParams {
	externalUserId: string;
	now: Date;
	reason: "completed" | "timeout" | "off_topic" | "malformed";
}

export interface CompareAndResetDialogStateParams {
	userId: string;
	expectedCreatedAt: Date;
	expectedExpiresAt: Date | null;
	now: Date;
	reason: "completed" | "timeout" | "off_topic" | "malformed";
}

export interface DialogStateResetResult {
	status: "reset" | "stale" | "already_idle" | "not_found";
	userId: string | null;
	previousState: StoredDialogStateRecord | null;
}

async function resolveUserId(db: DbClient, externalUserId: string): Promise<string | null> {
	const authRows = await db
		.select({ userId: userAuths.userId })
		.from(userAuths)
		.where(and(eq(userAuths.provider, "telegram"), eq(userAuths.externalId, externalUserId)));

	if (authRows.length === 0) return null;
	return authRows[0].userId;
}

async function getDialogStateRow(
	db: DbClient,
	userId: string,
): Promise<StoredDialogStateRecord | null> {
	const rows = await db.select().from(dialogStates).where(eq(dialogStates.userId, userId));

	if (rows.length === 0) return null;

	const row = rows[0];
	return {
		userId: row.userId,
		state: row.state as "idle" | "confirm" | "await",
		context: row.context,
		createdAt: row.createdAt,
		expiresAt: row.expiresAt,
	};
}

export function createDialogStateStore(db: DbClient): DialogStateStore {
	return {
		async getByExternalUserId(externalUserId) {
			const userId = await resolveUserId(db, externalUserId);
			if (!userId) return { userId: null, dialogState: null };

			const record = await getDialogStateRow(db, userId);
			if (!record || record.state === "idle") {
				return { userId, dialogState: null };
			}

			return { userId, dialogState: record };
		},

		async upsertByExternalUserId(params) {
			const userId = await resolveUserId(db, params.externalUserId);
			if (!userId) return null;

			const rows = await db
				.insert(dialogStates)
				.values({
					userId,
					state: params.state,
					context: params.context,
					createdAt: params.now,
					expiresAt: params.expiresAt,
				})
				.onConflictDoUpdate({
					target: dialogStates.userId,
					set: {
						state: params.state,
						context: params.context,
						createdAt: params.now,
						expiresAt: params.expiresAt,
					},
				})
				.returning();

			if (rows.length === 0) return null;

			const row = rows[0];
			return {
				userId: row.userId,
				state: row.state as "idle" | "confirm" | "await",
				context: row.context,
				createdAt: row.createdAt,
				expiresAt: row.expiresAt,
			};
		},

		async resetByExternalUserId(params) {
			const userId = await resolveUserId(db, params.externalUserId);
			if (!userId) return { status: "not_found" as const, userId: null, previousState: null };

			const current = await getDialogStateRow(db, userId);
			if (!current || current.state === "idle") {
				return { status: "already_idle" as const, userId, previousState: null };
			}

			await db
				.update(dialogStates)
				.set({
					state: "idle",
					context: null,
					createdAt: params.now,
					expiresAt: null,
				})
				.where(eq(dialogStates.userId, userId));

			return { status: "reset" as const, userId, previousState: current };
		},

		async compareAndResetByUserId(params) {
			const current = await getDialogStateRow(db, params.userId);
			if (!current) {
				return { status: "not_found" as const, userId: params.userId, previousState: null };
			}

			const createdAtMatch = current.createdAt.getTime() === params.expectedCreatedAt.getTime();
			const expiresAtMatch =
				(current.expiresAt === null && params.expectedExpiresAt === null) ||
				(current.expiresAt !== null &&
					params.expectedExpiresAt !== null &&
					current.expiresAt.getTime() === params.expectedExpiresAt.getTime());

			if (!createdAtMatch || !expiresAtMatch) {
				return { status: "stale" as const, userId: params.userId, previousState: null };
			}

			if (current.state === "idle") {
				return { status: "already_idle" as const, userId: params.userId, previousState: null };
			}

			const expiresAtPredicate =
				params.expectedExpiresAt === null
					? isNull(dialogStates.expiresAt)
					: eq(dialogStates.expiresAt, params.expectedExpiresAt);

			const updatedRows = await db
				.update(dialogStates)
				.set({
					state: "idle",
					context: null,
					createdAt: params.now,
					expiresAt: null,
				})
				.where(
					and(
						eq(dialogStates.userId, params.userId),
						eq(dialogStates.createdAt, params.expectedCreatedAt),
						expiresAtPredicate,
					),
				)
				.returning({ userId: dialogStates.userId });

			if (updatedRows.length === 0) {
				return { status: "stale" as const, userId: params.userId, previousState: null };
			}

			return { status: "reset" as const, userId: params.userId, previousState: current };
		},
	};
}

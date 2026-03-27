import { type DbClient, createDbClient } from "@/infra/db/client";
import { createResolveTelegramUserId } from "@/infra/db/queries/resolve-telegram-user-id";
import { upsertTokenUsage } from "@/infra/db/queries/token-usage";
import { tokenUsages } from "@/infra/db/schema/token-usages";
import { userAuths, users } from "@/infra/db/schema/users";
import { createTokenTracker } from "@/infra/llm/token-tracker";
import { createPipeline } from "@/pipeline/orchestrator";
import { createStubSteps } from "@/pipeline/steps/stubs";
import { createTokenQuotaStep } from "@/pipeline/steps/token-quota-check";
import type { MessageInput } from "@/shared/types";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";

const DATABASE_URL = process.env.DATABASE_URL ?? "postgresql://mema:password@localhost:5432/mema";

describe("E2E: Token Quota Check", () => {
	let connection: ReturnType<typeof postgres>;
	let db: DbClient;

	const testUserIds: string[] = [];

	beforeAll(async () => {
		connection = postgres(DATABASE_URL, { max: 1 });
		await connection.unsafe("CREATE EXTENSION IF NOT EXISTS vector;");

		const migrationDb = drizzle(connection);
		await migrate(migrationDb, { migrationsFolder: "./drizzle" });

		db = createDbClient(DATABASE_URL);
	}, 30_000);

	afterEach(async () => {
		for (const userId of testUserIds) {
			await db.delete(tokenUsages).where(eq(tokenUsages.userId, userId));
			await db.delete(userAuths).where(eq(userAuths.userId, userId));
			await db.delete(users).where(eq(users.id, userId));
		}
		testUserIds.length = 0;
	});

	afterAll(async () => {
		await connection.end();
	});

	async function createTestUser(externalId: string): Promise<string> {
		const [user] = await db.insert(users).values({ status: "active" }).returning({ id: users.id });
		const userId = user.id;
		testUserIds.push(userId);

		await db.insert(userAuths).values({ userId, provider: "telegram", externalId });

		return userId;
	}

	describe("createResolveTelegramUserId", () => {
		it("resolves existing telegram user to internal id", async () => {
			const userId = await createTestUser("tg-e2e-1");
			const resolve = createResolveTelegramUserId(db);

			const result = await resolve("tg-e2e-1");
			expect(result).toBe(userId);
		});

		it("returns null for unknown telegram user", async () => {
			const resolve = createResolveTelegramUserId(db);

			const result = await resolve("tg-nonexistent-999");
			expect(result).toBeNull();
		});
	});

	describe("pipeline token quota early exit", () => {
		it("blocks pipeline when quota exceeded", async () => {
			const userId = await createTestUser("tg-e2e-quota");

			const periodStart = new Date(
				Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth(), 1),
			);
			await upsertTokenUsage(db, {
				userId,
				tokensToAdd: 100_000,
				periodStart,
				quotaLimit: 50_000,
			});

			const tracker = createTokenTracker({ db, defaultQuotaLimit: 50_000 });
			const resolve = createResolveTelegramUserId(db);
			const notifyAdmin = vi.fn().mockResolvedValue(undefined);

			const step = createTokenQuotaStep({
				resolveUserId: resolve,
				checkQuota: tracker.checkQuota,
				notifyAdmin,
			});

			const steps = createStubSteps({ tokenQuotaCheck: step });
			const pipeline = createPipeline(steps);

			const input: MessageInput = {
				text: "hello",
				externalUserId: "tg-e2e-quota",
				username: "test",
				firstName: "Test",
				languageCode: "en",
				platformUpdateId: 1,
			};

			const result = await pipeline(input);
			expect(result).toContain("monthly usage limit");
			expect(notifyAdmin).toHaveBeenCalledOnce();
		});

		it("passes through when under quota", async () => {
			const userId = await createTestUser("tg-e2e-under");

			const periodStart = new Date(
				Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth(), 1),
			);
			await upsertTokenUsage(db, {
				userId,
				tokensToAdd: 100,
				periodStart,
				quotaLimit: 50_000,
			});

			const tracker = createTokenTracker({ db, defaultQuotaLimit: 50_000 });
			const resolve = createResolveTelegramUserId(db);
			const notifyAdmin = vi.fn();

			const step = createTokenQuotaStep({
				resolveUserId: resolve,
				checkQuota: tracker.checkQuota,
				notifyAdmin,
			});

			const steps = createStubSteps({ tokenQuotaCheck: step });
			const pipeline = createPipeline(steps);

			const input: MessageInput = {
				text: "hello",
				externalUserId: "tg-e2e-under",
				username: "test",
				firstName: "Test",
				languageCode: "en",
				platformUpdateId: 2,
			};

			const result = await pipeline(input);
			expect(result).not.toContain("monthly usage limit");
			expect(notifyAdmin).not.toHaveBeenCalled();
		});
	});
});

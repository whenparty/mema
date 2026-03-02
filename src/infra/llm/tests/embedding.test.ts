import type { AppEnv } from "@/shared/env";
import { EmbeddingServiceError, LlmApiError } from "@/shared/errors";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockGetProviderForModel, mockEmbed } = vi.hoisted(() => ({
	mockGetProviderForModel: vi.fn(),
	mockEmbed: vi.fn(),
}));

vi.mock("../provider-factory", () => ({
	getProviderForModel: mockGetProviderForModel,
}));

vi.mock("@/shared/logger", () => ({
	createChildLogger: vi.fn(() => ({
		info: vi.fn(),
		warn: vi.fn(),
		error: vi.fn(),
		debug: vi.fn(),
	})),
}));

import { createEmbeddingService } from "../embedding";

function makeEnv(overrides?: Partial<AppEnv>): AppEnv {
	return {
		databaseUrl: "postgres://localhost/test",
		telegramBotToken: "test-token",
		openaiApiKey: "test-openai-key",
		anthropicApiKey: "test-anthropic-key",
		adminUserId: "admin-1",
		nodeEnv: "test",
		port: 3000,
		logLevel: "info",
		rateLimitPerHour: 100,
		tokenQuotaMonthly: 0,
		sentryDsn: undefined,
		telegramWebhookUrl: undefined,
		...overrides,
	};
}

const TEST_MODELS = {
	compact: "gpt-5-nano",
	powerfulA: "claude-opus-4-6-20250501",
	powerfulB: "gpt-5.2",
	validator: "gpt-5-mini",
	embedding: "text-embedding-3-small",
};

function createService(overrides?: {
	retryOptions?: { maxAttempts: number; initialDelayMs: number; backoffMultiplier: number };
}) {
	return createEmbeddingService(makeEnv(), {
		getModels: () => TEST_MODELS,
		retryOptions: { maxAttempts: 1, initialDelayMs: 1, backoffMultiplier: 1 },
		...overrides,
	});
}

describe("createEmbeddingService", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mockGetProviderForModel.mockReturnValue({
			chat: vi.fn(),
			embed: mockEmbed,
		});
	});

	describe("embedText", () => {
		it("returns embedding vector for a single text", async () => {
			mockEmbed.mockResolvedValue([0.1, 0.2, 0.3]);
			const service = createService();
			const result = await service.embedText("Hello world");

			expect(result).toEqual([0.1, 0.2, 0.3]);
			expect(mockEmbed).toHaveBeenCalledWith("Hello world", "text-embedding-3-small");
		});

		it("trims whitespace from input text", async () => {
			mockEmbed.mockResolvedValue([0.1, 0.2]);
			const service = createService();
			await service.embedText("   hello world   ");

			expect(mockEmbed).toHaveBeenCalledWith("hello world", "text-embedding-3-small");
		});

		it("throws EmbeddingServiceError for empty text", async () => {
			const service = createService();

			await expect(service.embedText("   ")).rejects.toMatchObject({
				name: "EmbeddingServiceError",
				code: "EMBEDDING_EMPTY_INPUT",
				isRetryable: false,
				model: "text-embedding-3-small",
			});
		});

		it("resolves model per call via getModels()", async () => {
			let callCount = 0;
			const service = createEmbeddingService(makeEnv(), {
				getModels: () => ({
					...TEST_MODELS,
					embedding: callCount++ === 0 ? "model-a" : "model-b",
				}),
				retryOptions: { maxAttempts: 1, initialDelayMs: 1, backoffMultiplier: 1 },
			});
			mockEmbed.mockResolvedValue([0.1]);

			await service.embedText("first");
			await service.embedText("second");

			expect(mockGetProviderForModel).toHaveBeenNthCalledWith(1, "model-a", expect.any(Object));
			expect(mockGetProviderForModel).toHaveBeenNthCalledWith(2, "model-b", expect.any(Object));
		});

		it("wraps provider errors in EmbeddingServiceError", async () => {
			mockEmbed.mockRejectedValue(new Error("Network timeout"));
			const service = createService();

			const error = await service.embedText("test").catch((e: unknown) => e);
			expect(error).toBeInstanceOf(EmbeddingServiceError);
			expect((error as EmbeddingServiceError).code).toBe("EMBEDDING_PROVIDER_FAILURE");
			expect((error as EmbeddingServiceError).isRetryable).toBe(true);
		});

		it("preserves isRetryable=false from LlmApiError", async () => {
			mockEmbed.mockRejectedValue(new LlmApiError("Invalid key", "openai", 401, false));
			const service = createService();

			const error = await service.embedText("test").catch((e: unknown) => e);
			expect(error).toBeInstanceOf(EmbeddingServiceError);
			expect((error as EmbeddingServiceError).isRetryable).toBe(false);
		});

		it("throws EMBEDDING_INVALID_RESPONSE for empty vector", async () => {
			mockEmbed.mockResolvedValue([]);
			const service = createService();

			await expect(service.embedText("test")).rejects.toMatchObject({
				code: "EMBEDDING_INVALID_RESPONSE",
				isRetryable: false,
			});
		});

		it("throws EMBEDDING_INVALID_RESPONSE for non-finite values", async () => {
			mockEmbed.mockResolvedValue([0.1, Number.NaN, 0.3]);
			const service = createService();

			await expect(service.embedText("test")).rejects.toMatchObject({
				code: "EMBEDDING_INVALID_RESPONSE",
			});
		});
	});

	describe("embedBatch", () => {
		it("returns embeddings sequentially for multiple texts", async () => {
			const order: number[] = [];
			mockEmbed
				.mockImplementationOnce(async () => {
					order.push(1);
					return [0.1, 0.2];
				})
				.mockImplementationOnce(async () => {
					order.push(2);
					return [0.3, 0.4];
				})
				.mockImplementationOnce(async () => {
					order.push(3);
					return [0.5, 0.6];
				});

			const service = createService();
			const result = await service.embedBatch(["a", "b", "c"]);

			expect(result).toEqual([
				[0.1, 0.2],
				[0.3, 0.4],
				[0.5, 0.6],
			]);
			expect(order).toEqual([1, 2, 3]);
		});

		it("throws EmbeddingServiceError for empty batch", async () => {
			const service = createService();

			await expect(service.embedBatch([])).rejects.toMatchObject({
				code: "EMBEDDING_EMPTY_BATCH",
				isRetryable: false,
			});
			expect(mockEmbed).not.toHaveBeenCalled();
		});

		it("throws EMBEDDING_BATCH_ITEM_EMPTY with inputIndex for empty item", async () => {
			mockEmbed.mockResolvedValueOnce([0.1, 0.2]);
			const service = createService();

			const error = await service.embedBatch(["valid", "  "]).catch((e: unknown) => e);
			expect(error).toBeInstanceOf(EmbeddingServiceError);
			expect((error as EmbeddingServiceError).code).toBe("EMBEDDING_BATCH_ITEM_EMPTY");
			expect((error as EmbeddingServiceError).inputIndex).toBe(1);
		});

		it("stops processing on first failure", async () => {
			mockEmbed.mockResolvedValueOnce([0.1]).mockRejectedValueOnce(new Error("Rate limit"));

			const service = createService();

			await expect(service.embedBatch(["a", "b", "c"])).rejects.toMatchObject({
				code: "EMBEDDING_PROVIDER_FAILURE",
				inputIndex: 1,
			});
			expect(mockEmbed).toHaveBeenCalledTimes(2);
		});

		it("trims whitespace from each batch item", async () => {
			mockEmbed.mockResolvedValueOnce([0.1]).mockResolvedValueOnce([0.2]);
			const service = createService();

			await service.embedBatch(["  hello  ", "  world  "]);

			expect(mockEmbed).toHaveBeenNthCalledWith(1, "hello", "text-embedding-3-small");
			expect(mockEmbed).toHaveBeenNthCalledWith(2, "world", "text-embedding-3-small");
		});
	});
});

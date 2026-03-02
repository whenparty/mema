import { beforeEach, describe, expect, it, vi } from "vitest";
import { createEmbeddingService } from "../embedding";
import type { LLMProvider } from "../types";

vi.mock("@/shared/logger", () => {
	const childLogger = {
		info: vi.fn(),
		warn: vi.fn(),
		error: vi.fn(),
		debug: vi.fn(),
	};
	return {
		createChildLogger: vi.fn(() => childLogger),
	};
});

vi.mock("@/shared/env", () => ({
	getLlmModels: vi.fn(() => ({
		compact: "claude-haiku-4.5-20250315",
		powerfulA: "claude-sonnet-4-20250514",
		powerfulB: "gpt-5-mini",
		validator: "gpt-5-mini",
		embedding: "text-embedding-3-small",
	})),
}));

const mockProvider = vi.hoisted(() => ({
	chat: vi.fn(),
	embed: vi.fn(),
})) satisfies LLMProvider;

vi.mock("../provider-factory", () => ({
	getProviderForModel: vi.fn(() => mockProvider),
}));

vi.mock("../retry", () => ({
	withRetry: vi.fn((operation: () => Promise<unknown>) => operation()),
}));

import { withRetry } from "../retry";

function createFakeEnv() {
	return {
		databaseUrl: "postgres://localhost/test",
		telegramBotToken: "test-token",
		openaiApiKey: "test-openai-key",
		anthropicApiKey: "test-anthropic-key",
		adminUserId: "admin-1",
		nodeEnv: "test" as const,
		port: 3000,
		logLevel: "info" as const,
		rateLimitPerHour: 100,
		tokenQuotaMonthly: 0,
		sentryDsn: undefined,
		telegramWebhookUrl: undefined,
	};
}

describe("createEmbeddingService", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		// Restore default withRetry behavior: pass through to the operation
		vi.mocked(withRetry).mockImplementation((op: () => Promise<unknown>) => op() as Promise<never>);
	});

	describe("embedText", () => {
		it("returns embedding vector for a single text", async () => {
			const embedding = [0.1, 0.2, 0.3, 0.4];
			vi.mocked(mockProvider.embed).mockResolvedValue(embedding);

			const service = createEmbeddingService({ env: createFakeEnv() });
			const result = await service.embedText("Hello world");

			expect(result).toEqual(embedding);
			expect(mockProvider.embed).toHaveBeenCalledWith("Hello world", "text-embedding-3-small");
		});

		it("wraps the embed call with withRetry for transient error recovery", async () => {
			const embedding = [0.5, 0.6];
			vi.mocked(mockProvider.embed).mockResolvedValue(embedding);

			const service = createEmbeddingService({ env: createFakeEnv() });
			await service.embedText("test");

			expect(withRetry).toHaveBeenCalledTimes(1);
			expect(withRetry).toHaveBeenCalledWith(expect.any(Function));
		});

		it("propagates non-retryable errors from the provider", async () => {
			const error = new Error("Invalid API key");
			Object.assign(error, { isRetryable: false });
			vi.mocked(withRetry).mockRejectedValue(error);

			const service = createEmbeddingService({ env: createFakeEnv() });

			await expect(service.embedText("test")).rejects.toThrow("Invalid API key");
		});

		it("uses custom model when provided", async () => {
			const embedding = [0.1];
			vi.mocked(mockProvider.embed).mockResolvedValue(embedding);

			const service = createEmbeddingService({
				env: createFakeEnv(),
				model: "text-embedding-3-large",
			});
			await service.embedText("test");

			expect(mockProvider.embed).toHaveBeenCalledWith("test", "text-embedding-3-large");
		});
	});

	describe("embedBatch", () => {
		it("returns embeddings for multiple texts", async () => {
			const embeddings = [
				[0.1, 0.2],
				[0.3, 0.4],
				[0.5, 0.6],
			];
			vi.mocked(mockProvider.embed)
				.mockResolvedValueOnce(embeddings[0])
				.mockResolvedValueOnce(embeddings[1])
				.mockResolvedValueOnce(embeddings[2]);

			const service = createEmbeddingService({ env: createFakeEnv() });
			const result = await service.embedBatch(["text1", "text2", "text3"]);

			expect(result).toEqual(embeddings);
		});

		it("returns empty array for empty input", async () => {
			const service = createEmbeddingService({ env: createFakeEnv() });
			const result = await service.embedBatch([]);

			expect(result).toEqual([]);
			expect(mockProvider.embed).not.toHaveBeenCalled();
		});

		it("fails the entire batch when one embedding fails", async () => {
			vi.mocked(mockProvider.embed)
				.mockResolvedValueOnce([0.1, 0.2])
				.mockRejectedValueOnce(new Error("Rate limit exceeded"));

			const service = createEmbeddingService({ env: createFakeEnv() });

			await expect(service.embedBatch(["text1", "text2"])).rejects.toThrow("Rate limit exceeded");
		});

		it("wraps each individual embed call with withRetry", async () => {
			vi.mocked(mockProvider.embed).mockResolvedValueOnce([0.1]).mockResolvedValueOnce([0.2]);

			const service = createEmbeddingService({ env: createFakeEnv() });
			await service.embedBatch(["a", "b"]);

			// withRetry called once for each text in the batch
			expect(withRetry).toHaveBeenCalledTimes(2);
		});
	});
});

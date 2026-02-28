import { describe, expect, it, vi } from "vitest";
import type { TokenTracker } from "../token-tracker";
import { createTrackedLlmProvider } from "../tracked-provider";
import type { LLMProvider, LLMResponse } from "../types";

// Mock logger for warning assertions
vi.mock("@/shared/logger", () => {
	const childLogger = {
		info: vi.fn(),
		warn: vi.fn(),
		error: vi.fn(),
		debug: vi.fn(),
	};
	return {
		createChildLogger: vi.fn(() => childLogger),
		_childLogger: childLogger,
	};
});

import * as loggerModule from "@/shared/logger";

const mockChildLogger = (
	loggerModule as unknown as { _childLogger: Record<string, ReturnType<typeof vi.fn>> }
)._childLogger;

function createMockProvider(): LLMProvider {
	return {
		chat: vi.fn(),
		embed: vi.fn(),
	};
}

function createMockTracker(): TokenTracker {
	return {
		recordUsage: vi.fn().mockResolvedValue(undefined),
		checkQuota: vi.fn(),
		getUsage: vi.fn(),
	};
}

function createMockResponse(overrides?: Partial<LLMResponse>): LLMResponse {
	return {
		content: "Hello, world!",
		usage: { inputTokens: 100, outputTokens: 50 },
		model: "gpt-5-mini",
		...overrides,
	};
}

describe("createTrackedLlmProvider", () => {
	describe("chat", () => {
		it("records token usage after successful chat call (AC1)", async () => {
			const provider = createMockProvider();
			const tracker = createMockTracker();
			const response = createMockResponse();
			vi.mocked(provider.chat).mockResolvedValue(response);

			const tracked = createTrackedLlmProvider(provider, tracker, "user-1");
			await tracked.chat([{ role: "user", content: "Hi" }], { model: "gpt-5-mini" });

			expect(tracker.recordUsage).toHaveBeenCalledWith("user-1", "gpt-5-mini", 100, 50);
		});

		it("returns original LLMResponse unchanged", async () => {
			const provider = createMockProvider();
			const tracker = createMockTracker();
			const response = createMockResponse({
				content: "specific response",
				parsed: { key: "value" },
			});
			vi.mocked(provider.chat).mockResolvedValue(response);

			const tracked = createTrackedLlmProvider(provider, tracker, "user-1");
			const result = await tracked.chat([{ role: "user", content: "Hi" }], { model: "gpt-5-mini" });

			expect(result).toBe(response);
		});

		it("still returns response when token recording throws (best-effort)", async () => {
			const provider = createMockProvider();
			const tracker = createMockTracker();
			const response = createMockResponse();
			vi.mocked(provider.chat).mockResolvedValue(response);
			vi.mocked(tracker.recordUsage).mockRejectedValue(new Error("DB connection failed"));

			const tracked = createTrackedLlmProvider(provider, tracker, "user-1");
			const result = await tracked.chat([{ role: "user", content: "Hi" }], { model: "gpt-5-mini" });

			expect(result).toBe(response);
		});

		it("logs warning when token recording throws", async () => {
			const provider = createMockProvider();
			const tracker = createMockTracker();
			const response = createMockResponse();
			vi.mocked(provider.chat).mockResolvedValue(response);
			const recordingError = new Error("DB connection failed");
			vi.mocked(tracker.recordUsage).mockRejectedValue(recordingError);

			const tracked = createTrackedLlmProvider(provider, tracker, "user-1");
			await tracked.chat([{ role: "user", content: "Hi" }], { model: "gpt-5-mini" });

			expect(mockChildLogger.warn).toHaveBeenCalledWith(
				expect.objectContaining({
					userId: "user-1",
					error: recordingError,
				}),
				expect.any(String),
			);
		});
	});

	describe("embed", () => {
		it("passes through to provider.embed() without token recording", async () => {
			const provider = createMockProvider();
			const tracker = createMockTracker();
			const embedding = [0.1, 0.2, 0.3];
			vi.mocked(provider.embed).mockResolvedValue(embedding);

			const tracked = createTrackedLlmProvider(provider, tracker, "user-1");
			const result = await tracked.embed("test text", "text-embedding-3-small");

			expect(result).toBe(embedding);
			expect(provider.embed).toHaveBeenCalledWith("test text", "text-embedding-3-small");
			expect(tracker.recordUsage).not.toHaveBeenCalled();
		});
	});
});

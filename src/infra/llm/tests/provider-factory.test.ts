import { describe, expect, it, vi } from "vitest";

// Mock the provider modules
vi.mock("../providers/openai", () => ({
	createOpenAiProvider: vi.fn().mockReturnValue({
		chat: vi.fn(),
		embed: vi.fn(),
		_type: "openai",
	}),
}));

vi.mock("../providers/anthropic", () => ({
	createAnthropicProvider: vi.fn().mockReturnValue({
		chat: vi.fn(),
		embed: vi.fn(),
		_type: "anthropic",
	}),
}));

import type { AppEnv } from "@/shared/env";
import { getProviderForModel } from "../provider-factory";
import { createAnthropicProvider } from "../providers/anthropic";
import { createOpenAiProvider } from "../providers/openai";

function makeEnv(overrides?: Partial<AppEnv>): AppEnv {
	return {
		databaseUrl: "postgres://localhost/test",
		telegramBotToken: "test-token",
		openaiApiKey: "test-openai-key",
		anthropicApiKey: "test-anthropic-key",
		adminUserId: "123",
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

describe("getProviderForModel", () => {
	it("routes claude-* models to Anthropic provider", () => {
		const env = makeEnv();
		getProviderForModel("claude-haiku-4-5-20250315", env);

		expect(createAnthropicProvider).toHaveBeenCalledWith("test-anthropic-key");
	});

	it("routes claude-opus-4-6 to Anthropic provider", () => {
		const env = makeEnv();
		getProviderForModel("claude-opus-4-6-20250501", env);

		expect(createAnthropicProvider).toHaveBeenCalledWith("test-anthropic-key");
	});

	it("routes gpt-* models to OpenAI provider", () => {
		const env = makeEnv();
		getProviderForModel("gpt-5-mini", env);

		expect(createOpenAiProvider).toHaveBeenCalledWith("test-openai-key");
	});

	it("routes gpt-5.2 to OpenAI provider", () => {
		const env = makeEnv();
		getProviderForModel("gpt-5.2", env);

		expect(createOpenAiProvider).toHaveBeenCalledWith("test-openai-key");
	});

	it("routes text-embedding-* models to OpenAI provider", () => {
		const env = makeEnv();
		getProviderForModel("text-embedding-3-small", env);

		expect(createOpenAiProvider).toHaveBeenCalledWith("test-openai-key");
	});

	it("routes o1-* models to OpenAI provider", () => {
		const env = makeEnv();
		getProviderForModel("o1-mini", env);

		expect(createOpenAiProvider).toHaveBeenCalledWith("test-openai-key");
	});

	it("throws for unknown model prefix", () => {
		const env = makeEnv();

		expect(() => getProviderForModel("llama-3-70b", env)).toThrow(/unknown model prefix/i);
	});

	it("throws descriptive error with model name", () => {
		const env = makeEnv();

		expect(() => getProviderForModel("mistral-large", env)).toThrow("mistral-large");
	});

	it("returns an LLMProvider object with chat and embed", () => {
		const env = makeEnv();
		const provider = getProviderForModel("gpt-5-mini", env);

		expect(provider).toHaveProperty("chat");
		expect(provider).toHaveProperty("embed");
	});
});

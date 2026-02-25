import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const REQUIRED_VARS = {
	DATABASE_URL: "postgresql://mema:password@localhost:5432/mema",
	TELEGRAM_BOT_TOKEN: "test-bot-token",
	OPENAI_API_KEY: "sk-test-openai-key",
	ANTHROPIC_API_KEY: "sk-ant-test-key",
	ADMIN_USER_ID: "123456789",
	LLM_COMPACT_MODEL: "gpt-5-nano",
	LLM_POWERFUL_MODEL_A: "claude-opus-4-6",
	LLM_POWERFUL_MODEL_B: "gpt-5.2",
	LLM_VALIDATOR_MODEL: "gpt-5-nano",
	LLM_EMBEDDING_MODEL: "text-embedding-3-small",
};

const ALL_REQUIRED_KEYS = Object.keys(REQUIRED_VARS);

function makeEnv(
	overrides: Record<string, string | undefined> = {},
): Record<string, string | undefined> {
	return { ...REQUIRED_VARS, TZ: "UTC", ...overrides };
}

describe("validateEnv", () => {
	let originalEnv: Record<string, string | undefined>;

	beforeEach(() => {
		originalEnv = { ...process.env };
	});

	afterEach(() => {
		// Restore all env vars
		for (const key of Object.keys(process.env)) {
			if (!(key in originalEnv)) {
				delete process.env[key];
			}
		}
		for (const [key, value] of Object.entries(originalEnv)) {
			if (value === undefined) {
				delete process.env[key];
			} else {
				process.env[key] = value;
			}
		}
	});

	it("throws with all missing required vars listed", async () => {
		const { validateEnv } = await import("@/shared/env");

		expect(() => validateEnv({})).toThrow("Environment validation failed");

		try {
			validateEnv({});
		} catch (error) {
			const message = (error as Error).message;
			for (const key of ALL_REQUIRED_KEYS) {
				expect(message).toContain(key);
			}
		}
	});

	it("provides documented defaults for optional vars", async () => {
		const { validateEnv } = await import("@/shared/env");

		const env = validateEnv(makeEnv());

		expect(env.nodeEnv).toBe("development");
		expect(env.port).toBe(3000);
		expect(env.logLevel).toBe("info");
		expect(env.rateLimitPerHour).toBe(100);
		expect(env.tokenQuotaMonthly).toBe(0);
	});

	it("parses a complete valid env successfully", async () => {
		const { validateEnv } = await import("@/shared/env");

		const env = validateEnv(
			makeEnv({
				NODE_ENV: "production",
				PORT: "8080",
				LOG_LEVEL: "warn",
				RATE_LIMIT_PER_HOUR: "200",
				TOKEN_QUOTA_MONTHLY: "500000",
				SENTRY_DSN: "https://sentry.example.com/1",
				TELEGRAM_WEBHOOK_URL: "https://example.com/webhook",
			}),
		);

		expect(env.databaseUrl).toBe(REQUIRED_VARS.DATABASE_URL);
		expect(env.telegramBotToken).toBe(REQUIRED_VARS.TELEGRAM_BOT_TOKEN);
		expect(env.openaiApiKey).toBe(REQUIRED_VARS.OPENAI_API_KEY);
		expect(env.anthropicApiKey).toBe(REQUIRED_VARS.ANTHROPIC_API_KEY);
		expect(env.adminUserId).toBe(REQUIRED_VARS.ADMIN_USER_ID);
		expect(env.nodeEnv).toBe("production");
		expect(env.port).toBe(8080);
		expect(env.logLevel).toBe("warn");
		expect(env.rateLimitPerHour).toBe(200);
		expect(env.tokenQuotaMonthly).toBe(500000);
		expect(env.sentryDsn).toBe("https://sentry.example.com/1");
		expect(env.telegramWebhookUrl).toBe("https://example.com/webhook");
	});

	it("coerces PORT from string to number", async () => {
		const { validateEnv } = await import("@/shared/env");

		const env = validateEnv(makeEnv({ PORT: "8080" }));

		expect(env.port).toBe(8080);
		expect(typeof env.port).toBe("number");
	});

	it("rejects invalid LOG_LEVEL values", async () => {
		const { validateEnv } = await import("@/shared/env");

		expect(() => validateEnv(makeEnv({ LOG_LEVEL: "verbose" }))).toThrow(
			"Environment validation failed",
		);
	});

	it("accepts all valid pino log levels", async () => {
		const { validateEnv } = await import("@/shared/env");
		const validLevels = ["fatal", "error", "warn", "info", "debug", "trace"];

		for (const level of validLevels) {
			const env = validateEnv(makeEnv({ LOG_LEVEL: level }));
			expect(env.logLevel).toBe(level);
		}
	});

	it("warns when TZ is not UTC in development", async () => {
		const { validateEnv } = await import("@/shared/env");
		const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

		validateEnv(makeEnv({ TZ: "America/New_York" }));

		expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining("TZ is not set to 'UTC'"));
		warnSpy.mockRestore();
	});

	it("warns when TZ is missing in development", async () => {
		const { validateEnv } = await import("@/shared/env");
		const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

		const envWithoutTz = makeEnv();
		// biome-ignore lint/performance/noDelete: only way to truly unset env vars in a plain object
		delete envWithoutTz.TZ;
		validateEnv(envWithoutTz);

		expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining("TZ is not set to 'UTC'"));
		warnSpy.mockRestore();
	});

	it("throws when TZ is not UTC in production", async () => {
		const { validateEnv } = await import("@/shared/env");

		expect(() => validateEnv(makeEnv({ NODE_ENV: "production", TZ: "America/New_York" }))).toThrow(
			"TZ is not set to 'UTC'",
		);
	});

	it("does not expose sensitive var values in error messages", async () => {
		const { validateEnv } = await import("@/shared/env");

		const envWithBadPort = makeEnv({ PORT: "-1" });

		try {
			validateEnv(envWithBadPort);
			expect.unreachable("should have thrown");
		} catch (error) {
			const message = (error as Error).message;
			expect(message).not.toContain(REQUIRED_VARS.DATABASE_URL);
			expect(message).not.toContain(REQUIRED_VARS.OPENAI_API_KEY);
			expect(message).not.toContain(REQUIRED_VARS.ANTHROPIC_API_KEY);
			expect(message).not.toContain(REQUIRED_VARS.TELEGRAM_BOT_TOKEN);
		}
	});
});

describe("getLlmModels", () => {
	let originalEnv: Record<string, string | undefined>;

	beforeEach(() => {
		originalEnv = {};
		for (const key of Object.keys(REQUIRED_VARS)) {
			if (key.startsWith("LLM_")) {
				originalEnv[key] = process.env[key];
			}
		}
	});

	afterEach(() => {
		for (const [key, value] of Object.entries(originalEnv)) {
			if (value === undefined) {
				delete process.env[key];
			} else {
				process.env[key] = value;
			}
		}
	});

	it("reads LLM model vars from process.env on each call (not cached)", async () => {
		const { getLlmModels } = await import("@/shared/env");

		process.env.LLM_COMPACT_MODEL = "model-a";
		process.env.LLM_POWERFUL_MODEL_A = "model-b";
		process.env.LLM_POWERFUL_MODEL_B = "model-c";
		process.env.LLM_VALIDATOR_MODEL = "model-d";
		process.env.LLM_EMBEDDING_MODEL = "model-e";

		const first = getLlmModels();
		expect(first.compact).toBe("model-a");

		process.env.LLM_COMPACT_MODEL = "model-changed";
		const second = getLlmModels();
		expect(second.compact).toBe("model-changed");
	});

	it("throws when LLM model vars are missing", async () => {
		const { getLlmModels } = await import("@/shared/env");

		// biome-ignore lint/performance/noDelete: only way to truly unset env vars
		delete process.env.LLM_COMPACT_MODEL;
		// biome-ignore lint/performance/noDelete: only way to truly unset env vars
		delete process.env.LLM_POWERFUL_MODEL_A;

		expect(() => getLlmModels()).toThrow("Missing LLM model env vars");
	});

	it("returns all five model fields", async () => {
		const { getLlmModels } = await import("@/shared/env");

		process.env.LLM_COMPACT_MODEL = "compact";
		process.env.LLM_POWERFUL_MODEL_A = "powerful-a";
		process.env.LLM_POWERFUL_MODEL_B = "powerful-b";
		process.env.LLM_VALIDATOR_MODEL = "validator";
		process.env.LLM_EMBEDDING_MODEL = "embedding";

		const models = getLlmModels();
		expect(models).toEqual({
			compact: "compact",
			powerfulA: "powerful-a",
			powerfulB: "powerful-b",
			validator: "validator",
			embedding: "embedding",
		});
	});
});

describe("initEnv / getEnv", () => {
	afterEach(async () => {
		const { resetEnvForTesting } = await import("@/shared/env");
		resetEnvForTesting();
	});

	it("getEnv throws before initEnv is called", async () => {
		const { resetEnvForTesting, getEnv } = await import("@/shared/env");
		resetEnvForTesting();

		expect(() => getEnv()).toThrow("Environment not initialized");
	});

	it("initEnv validates and caches, getEnv returns cached value", async () => {
		const { resetEnvForTesting, initEnv, getEnv } = await import("@/shared/env");
		resetEnvForTesting();

		const env = initEnv(makeEnv());

		expect(env.port).toBe(3000);
		expect(getEnv()).toBe(env);
	});
});

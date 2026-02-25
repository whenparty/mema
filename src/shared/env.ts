import { z } from "zod";

const pinoLevels = ["fatal", "error", "warn", "info", "debug", "trace"] as const;

const SENSITIVE_KEYS = new Set([
	"DATABASE_URL",
	"TELEGRAM_BOT_TOKEN",
	"OPENAI_API_KEY",
	"ANTHROPIC_API_KEY",
]);

const envSchema = z.object({
	// Required at startup
	DATABASE_URL: z.string().min(1),
	TELEGRAM_BOT_TOKEN: z.string().min(1),
	OPENAI_API_KEY: z.string().min(1),
	ANTHROPIC_API_KEY: z.string().min(1),
	ADMIN_USER_ID: z.string().min(1),

	// LLM models — validated as present at startup
	LLM_COMPACT_MODEL: z.string().min(1),
	LLM_POWERFUL_MODEL_A: z.string().min(1),
	LLM_POWERFUL_MODEL_B: z.string().min(1),
	LLM_VALIDATOR_MODEL: z.string().min(1),
	LLM_EMBEDDING_MODEL: z.string().min(1),

	// Optional with defaults
	NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
	PORT: z.coerce.number().int().positive().default(3000),
	LOG_LEVEL: z.enum(pinoLevels).default("info"),
	RATE_LIMIT_PER_HOUR: z.coerce.number().int().nonnegative().default(100),
	TOKEN_QUOTA_MONTHLY: z.coerce.number().int().nonnegative().default(0),

	// Optional (may not exist yet)
	SENTRY_DSN: z.string().optional(),
	TELEGRAM_WEBHOOK_URL: z.string().url().optional(),
});

export interface AppEnv {
	databaseUrl: string;
	telegramBotToken: string;
	openaiApiKey: string;
	anthropicApiKey: string;
	adminUserId: string;
	nodeEnv: "development" | "production" | "test";
	port: number;
	logLevel: string;
	rateLimitPerHour: number;
	tokenQuotaMonthly: number;
	sentryDsn: string | undefined;
	telegramWebhookUrl: string | undefined;
}

export interface LlmModels {
	compact: string;
	powerfulA: string;
	powerfulB: string;
	validator: string;
	embedding: string;
}

function buildAppEnv(data: z.output<typeof envSchema>): AppEnv {
	return {
		databaseUrl: data.DATABASE_URL,
		telegramBotToken: data.TELEGRAM_BOT_TOKEN,
		openaiApiKey: data.OPENAI_API_KEY,
		anthropicApiKey: data.ANTHROPIC_API_KEY,
		adminUserId: data.ADMIN_USER_ID,
		nodeEnv: data.NODE_ENV,
		port: data.PORT,
		logLevel: data.LOG_LEVEL,
		rateLimitPerHour: data.RATE_LIMIT_PER_HOUR,
		tokenQuotaMonthly: data.TOKEN_QUOTA_MONTHLY,
		sentryDsn: data.SENTRY_DSN,
		telegramWebhookUrl: data.TELEGRAM_WEBHOOK_URL,
	};
}

function formatValidationError(error: z.ZodError): string {
	const issues = error.issues.map((issue) => {
		const path = issue.path.join(".");
		if (SENSITIVE_KEYS.has(path)) {
			return `  ${path}: [required]`;
		}
		return `  ${path}: ${issue.message}`;
	});
	return `Environment validation failed:\n${issues.join("\n")}`;
}

export function validateEnv(envRecord: Record<string, string | undefined> = process.env): AppEnv {
	const result = envSchema.safeParse(envRecord);

	if (!result.success) {
		throw new Error(formatValidationError(result.error));
	}

	if (envRecord.TZ !== "UTC") {
		console.warn("[env] WARNING: TZ is not set to 'UTC'. rrule.js may produce incorrect results.");
	}

	return buildAppEnv(result.data);
}

export function getLlmModels(): LlmModels {
	return {
		compact: process.env.LLM_COMPACT_MODEL ?? "",
		powerfulA: process.env.LLM_POWERFUL_MODEL_A ?? "",
		powerfulB: process.env.LLM_POWERFUL_MODEL_B ?? "",
		validator: process.env.LLM_VALIDATOR_MODEL ?? "",
		embedding: process.env.LLM_EMBEDDING_MODEL ?? "",
	};
}

let _env: AppEnv | undefined;

export function initEnv(envRecord: Record<string, string | undefined> = process.env): AppEnv {
	_env = validateEnv(envRecord);
	return _env;
}

export function getEnv(): AppEnv {
	if (!_env) {
		throw new Error("Environment not initialized. Call initEnv() first.");
	}
	return _env;
}

/**
 * Reset the cached env. Only for use in tests.
 */
export function resetEnvForTesting(): void {
	_env = undefined;
}

import type { AppEnv } from "@/shared/env";
import { createAnthropicProvider } from "./providers/anthropic";
import { createOpenAiProvider } from "./providers/openai";
import type { LLMProvider } from "./types";

function isAnthropicModel(model: string): boolean {
	return model.startsWith("claude-") || model.includes("claude");
}

function isOpenAiModel(model: string): boolean {
	return (
		model.startsWith("gpt-") ||
		model.startsWith("text-embedding-") ||
		model.startsWith("o1-") ||
		model.startsWith("o3-")
	);
}

export function getProviderForModel(model: string, env: AppEnv): LLMProvider {
	if (isAnthropicModel(model)) {
		return createAnthropicProvider(env.anthropicApiKey);
	}

	if (isOpenAiModel(model)) {
		return createOpenAiProvider(env.openaiApiKey);
	}

	throw new Error(
		`Unknown model prefix for "${model}". Expected claude-*, gpt-*, text-embedding-*, o1-*, or o3-*.`,
	);
}

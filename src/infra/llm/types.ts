export interface ChatMessage {
	role: "system" | "user" | "assistant";
	content: string;
}

export interface JsonSchemaDefinition {
	name: string;
	description?: string;
	schema: Record<string, unknown>;
}

export interface LLMOptions {
	model: string;
	/** Optional temperature (not supported by GPT-5 family) */
	temperature?: number;
	/** Reasoning effort for GPT-5 family models (replaces temperature: 0) */
	reasoningEffort?: "low" | "medium" | "high";
	/** Max tokens for the response */
	maxTokens?: number;
	/** Request structured JSON output conforming to this schema */
	jsonSchema?: JsonSchemaDefinition;
	/** Abort signal for cancellation */
	signal?: AbortSignal;
}

export interface LLMResponse {
	content: string;
	usage: {
		inputTokens: number;
		outputTokens: number;
	};
	model: string;
	/** Parsed structured output when jsonSchema was provided */
	parsed?: unknown;
}

export interface LLMProvider {
	chat(messages: ChatMessage[], options: LLMOptions): Promise<LLMResponse>;
	embed(text: string, model: string): Promise<number[]>;
}

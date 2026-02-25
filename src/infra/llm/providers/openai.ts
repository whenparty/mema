import { LlmApiError } from "@/shared/errors";
import OpenAI from "openai";
import type {
	ChatCompletion,
	ChatCompletionCreateParamsNonStreaming,
} from "openai/resources/chat/completions";
import type { ChatMessage, LLMOptions, LLMProvider, LLMResponse } from "../types";

const RETRYABLE_STATUS_CODES = new Set([429, 500, 502, 503]);
const NON_RETRYABLE_STATUS_CODES = new Set([400, 401, 403, 404]);

function isGpt5Model(model: string): boolean {
	return model.startsWith("gpt-5");
}

function getStatusCode(error: unknown): number | undefined {
	if (
		typeof error === "object" &&
		error !== null &&
		"status" in error &&
		typeof (error as { status: unknown }).status === "number"
	) {
		return (error as { status: number }).status;
	}
	return undefined;
}

function wrapError(error: unknown): LlmApiError {
	const statusCode = getStatusCode(error);
	const message = error instanceof Error ? error.message : "Unknown OpenAI API error";

	// When statusCode is undefined (e.g. network errors), the fallback `?? 0`
	// is not in NON_RETRYABLE set, so isRetryable evaluates to true.
	const isRetryable =
		statusCode !== undefined
			? RETRYABLE_STATUS_CODES.has(statusCode)
			: !NON_RETRYABLE_STATUS_CODES.has(statusCode ?? 0);

	return new LlmApiError(message, "openai", statusCode, isRetryable, error);
}

function buildChatParams(
	messages: ChatMessage[],
	options: LLMOptions,
): ChatCompletionCreateParamsNonStreaming {
	const params: Record<string, unknown> = {
		model: options.model,
		messages: messages.map((msg) => ({
			role: msg.role,
			content: msg.content,
		})),
	};

	if (isGpt5Model(options.model)) {
		if (options.reasoningEffort) {
			params.reasoning_effort = options.reasoningEffort;
		}
	} else {
		if (options.temperature !== undefined) {
			params.temperature = options.temperature;
		}
	}

	if (options.maxTokens !== undefined) {
		params.max_tokens = options.maxTokens;
	}

	if (options.jsonSchema) {
		params.response_format = {
			type: "json_schema",
			json_schema: {
				name: options.jsonSchema.name,
				description: options.jsonSchema.description,
				strict: true,
				schema: options.jsonSchema.schema,
			},
		};
	}

	// Double cast needed: params is built dynamically with conditional fields,
	// so TypeScript cannot verify structural compatibility at compile time.
	return params as unknown as ChatCompletionCreateParamsNonStreaming;
}

function parseContent(
	rawContent: string | null | undefined,
	hasJsonSchema: boolean,
): { content: string; parsed?: unknown } {
	const content = rawContent ?? "";

	if (!hasJsonSchema || content === "") {
		return { content };
	}

	try {
		const parsed: unknown = JSON.parse(content);
		return { content, parsed };
	} catch {
		throw new LlmApiError("Failed to parse structured output JSON", "openai", undefined, false);
	}
}

export function createOpenAiProvider(apiKey: string): LLMProvider {
	const client = new OpenAI({ apiKey });

	return {
		async chat(messages: ChatMessage[], options: LLMOptions): Promise<LLMResponse> {
			try {
				const params = buildChatParams(messages, options);
				const response: ChatCompletion = await client.chat.completions.create(
					params,
					options.signal ? { signal: options.signal } : undefined,
				);

				const choice = response.choices[0];
				const { content, parsed } = parseContent(
					choice?.message?.content,
					options.jsonSchema !== undefined,
				);

				return {
					content,
					usage: {
						inputTokens: response.usage?.prompt_tokens ?? 0,
						outputTokens: response.usage?.completion_tokens ?? 0,
					},
					model: response.model,
					parsed,
				};
			} catch (error: unknown) {
				if (error instanceof LlmApiError) {
					throw error;
				}
				throw wrapError(error);
			}
		},

		async embed(text: string, model: string): Promise<number[]> {
			try {
				const response = await client.embeddings.create({
					model,
					input: text,
				});

				return response.data[0].embedding;
			} catch (error: unknown) {
				if (error instanceof LlmApiError) {
					throw error;
				}
				throw wrapError(error);
			}
		},
	};
}

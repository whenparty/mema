import { LlmApiError } from "@/shared/errors";
import Anthropic from "@anthropic-ai/sdk";
import type {
	Message,
	MessageCreateParamsNonStreaming,
} from "@anthropic-ai/sdk/resources/messages/messages";
import type { ChatMessage, LLMOptions, LLMProvider, LLMResponse } from "../types";

const RETRYABLE_STATUS_CODES = new Set([429, 500, 502, 503, 529]);
const NON_RETRYABLE_STATUS_CODES = new Set([400, 401, 403, 404]);

const DEFAULT_MAX_TOKENS = 4096;

interface AnthropicTextBlock {
	type: "text";
	text: string;
}

interface AnthropicToolUseBlock {
	type: "tool_use";
	id: string;
	name: string;
	input: unknown;
}

type AnthropicContentBlock = AnthropicTextBlock | AnthropicToolUseBlock;

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
	const message = error instanceof Error ? error.message : "Unknown Anthropic API error";

	// When statusCode is undefined (e.g. network errors), the fallback `?? 0`
	// is not in NON_RETRYABLE set, so isRetryable evaluates to true.
	const isRetryable =
		statusCode !== undefined
			? RETRYABLE_STATUS_CODES.has(statusCode)
			: !NON_RETRYABLE_STATUS_CODES.has(statusCode ?? 0);

	return new LlmApiError(message, "anthropic", statusCode, isRetryable, error);
}

function extractSystemMessage(messages: ChatMessage[]): {
	system: string | undefined;
	userMessages: ChatMessage[];
} {
	if (messages.length > 0 && messages[0].role === "system") {
		return {
			system: messages[0].content,
			userMessages: messages.slice(1),
		};
	}
	return { system: undefined, userMessages: messages };
}

function extractContent(
	contentBlocks: AnthropicContentBlock[],
	hasJsonSchema: boolean,
): { content: string; parsed?: unknown } {
	if (hasJsonSchema) {
		const toolBlock = contentBlocks.find(
			(block): block is AnthropicToolUseBlock => block.type === "tool_use",
		);
		if (toolBlock) {
			return {
				content: JSON.stringify(toolBlock.input),
				parsed: toolBlock.input,
			};
		}
	}

	const textBlocks = contentBlocks.filter(
		(block): block is AnthropicTextBlock => block.type === "text",
	);
	const content = textBlocks.map((block) => block.text).join("");
	return { content };
}

export function createAnthropicProvider(apiKey: string): LLMProvider {
	const client = new Anthropic({ apiKey });

	return {
		async chat(messages: ChatMessage[], options: LLMOptions): Promise<LLMResponse> {
			try {
				const { system, userMessages } = extractSystemMessage(messages);

				const params: Record<string, unknown> = {
					model: options.model,
					max_tokens: options.maxTokens ?? DEFAULT_MAX_TOKENS,
					messages: userMessages.map((msg) => ({
						role: msg.role,
						content: msg.content,
					})),
				};

				if (system !== undefined) {
					params.system = system;
				}

				if (options.temperature !== undefined) {
					params.temperature = options.temperature;
				}

				if (options.jsonSchema) {
					params.tools = [
						{
							name: options.jsonSchema.name,
							description: options.jsonSchema.description,
							input_schema: options.jsonSchema.schema,
						},
					];
					params.tool_choice = {
						type: "tool",
						name: options.jsonSchema.name,
					};
				}

				// Double cast needed: params is built dynamically with conditional fields,
				// so TypeScript cannot verify structural compatibility at compile time.
				const response: Message = await client.messages.create(
					params as unknown as MessageCreateParamsNonStreaming,
					options.signal ? { signal: options.signal } : undefined,
				);

				const { content, parsed } = extractContent(
					response.content as AnthropicContentBlock[],
					options.jsonSchema !== undefined,
				);

				return {
					content,
					usage: {
						inputTokens: response.usage.input_tokens,
						outputTokens: response.usage.output_tokens,
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

		async embed(_text: string, _model: string): Promise<number[]> {
			throw new LlmApiError(
				"Anthropic does not provide an embedding API. Use OpenAI for embeddings.",
				"anthropic",
				undefined,
				false,
			);
		},
	};
}

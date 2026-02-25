import { describe, expect, it } from "vitest";
import type {
	ChatMessage,
	JsonSchemaDefinition,
	LLMOptions,
	LLMProvider,
	LLMResponse,
} from "../types";

describe("LLM types", () => {
	it("ChatMessage satisfies the interface contract", () => {
		const message: ChatMessage = { role: "user", content: "hello" };
		expect(message.role).toBe("user");
		expect(message.content).toBe("hello");
	});

	it("ChatMessage supports all roles", () => {
		const roles: ChatMessage["role"][] = ["system", "user", "assistant"];
		for (const role of roles) {
			const message: ChatMessage = { role, content: "test" };
			expect(message.role).toBe(role);
		}
	});

	it("JsonSchemaDefinition requires name and schema", () => {
		const schema: JsonSchemaDefinition = {
			name: "extraction",
			schema: { type: "object", properties: { facts: { type: "array" } } },
		};
		expect(schema.name).toBe("extraction");
		expect(schema.schema).toBeDefined();
	});

	it("JsonSchemaDefinition allows optional description", () => {
		const schema: JsonSchemaDefinition = {
			name: "extraction",
			description: "Extract facts",
			schema: { type: "object" },
		};
		expect(schema.description).toBe("Extract facts");
	});

	it("LLMOptions requires model", () => {
		const options: LLMOptions = { model: "gpt-5-mini" };
		expect(options.model).toBe("gpt-5-mini");
	});

	it("LLMOptions supports all optional fields", () => {
		const controller = new AbortController();
		const options: LLMOptions = {
			model: "claude-haiku-4-5-20250315",
			temperature: 0.7,
			reasoningEffort: "low",
			maxTokens: 1000,
			jsonSchema: { name: "test", schema: { type: "object" } },
			signal: controller.signal,
		};
		expect(options.temperature).toBe(0.7);
		expect(options.reasoningEffort).toBe("low");
		expect(options.maxTokens).toBe(1000);
		expect(options.jsonSchema).toBeDefined();
		expect(options.signal).toBeDefined();
	});

	it("LLMResponse contains required fields", () => {
		const response: LLMResponse = {
			content: "Hello!",
			usage: { inputTokens: 10, outputTokens: 5 },
			model: "gpt-5-mini",
		};
		expect(response.content).toBe("Hello!");
		expect(response.usage.inputTokens).toBe(10);
		expect(response.usage.outputTokens).toBe(5);
		expect(response.model).toBe("gpt-5-mini");
	});

	it("LLMResponse supports optional parsed field", () => {
		const response: LLMResponse = {
			content: '{"facts": []}',
			usage: { inputTokens: 10, outputTokens: 5 },
			model: "gpt-5-mini",
			parsed: { facts: [] },
		};
		expect(response.parsed).toEqual({ facts: [] });
	});

	it("LLMProvider interface requires chat and embed methods", () => {
		const provider: LLMProvider = {
			chat: async () => ({
				content: "test",
				usage: { inputTokens: 0, outputTokens: 0 },
				model: "test",
			}),
			embed: async () => [0.1, 0.2, 0.3],
		};
		expect(provider.chat).toBeInstanceOf(Function);
		expect(provider.embed).toBeInstanceOf(Function);
	});
});

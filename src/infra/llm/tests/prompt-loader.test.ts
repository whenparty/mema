import * as fs from "node:fs";
import * as fsp from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import { PromptLoadError } from "@/shared/errors";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

// Mock the logger
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

import { createPromptLoader } from "../prompt-loader";

let tmpDir: string;

beforeAll(async () => {
	tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "prompt-loader-test-"));

	// Create test template files
	await fsp.writeFile(path.join(tmpDir, "simple.ftl"), "Hello, ${name}!");
	await fsp.writeFile(
		path.join(tmpDir, "multi.ftl"),
		"Hello, ${firstName} ${lastName}! Welcome to ${place}.",
	);
	await fsp.writeFile(path.join(tmpDir, "no-vars.ftl"), "This template has no variables.");
	await fsp.writeFile(path.join(tmpDir, "surrounding.ftl"), "Before ${middle} after");

	// Create subdirectory with template
	await fsp.mkdir(path.join(tmpDir, "extraction"), { recursive: true });
	await fsp.writeFile(
		path.join(tmpDir, "extraction", "facts.ftl"),
		"Extract facts from: ${message}",
	);
});

afterAll(async () => {
	await fsp.rm(tmpDir, { recursive: true, force: true });
});

describe("createPromptLoader", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it("renders a simple template with one variable", async () => {
		const loader = createPromptLoader({ promptsDir: tmpDir, nodeEnv: "test" });

		const result = await loader.render("simple.ftl", { name: "Alice" });

		expect(result).toBe("Hello, Alice!");
	});

	it("renders template with multiple variables", async () => {
		const loader = createPromptLoader({ promptsDir: tmpDir, nodeEnv: "test" });

		const result = await loader.render("multi.ftl", {
			firstName: "Alice",
			lastName: "Smith",
			place: "Mema",
		});

		expect(result).toBe("Hello, Alice Smith! Welcome to Mema.");
	});

	it("throws PromptLoadError for missing variable", async () => {
		const loader = createPromptLoader({ promptsDir: tmpDir, nodeEnv: "test" });

		await expect(loader.render("multi.ftl", { firstName: "Alice" })).rejects.toThrow(
			PromptLoadError,
		);

		try {
			await loader.render("multi.ftl", { firstName: "Alice" });
		} catch (error) {
			expect(error).toBeInstanceOf(PromptLoadError);
			const promptError = error as PromptLoadError;
			expect(promptError.templateName).toBe("multi.ftl");
			expect(promptError.message).toContain("lastName");
		}
	});

	it("throws PromptLoadError for missing template file", async () => {
		const loader = createPromptLoader({ promptsDir: tmpDir, nodeEnv: "test" });

		await expect(loader.render("nonexistent.ftl", {})).rejects.toThrow(PromptLoadError);

		try {
			await loader.render("nonexistent.ftl", {});
		} catch (error) {
			expect(error).toBeInstanceOf(PromptLoadError);
			const promptError = error as PromptLoadError;
			expect(promptError.templateName).toBe("nonexistent.ftl");
		}
	});

	it("caches template in production mode", async () => {
		const loader = createPromptLoader({ promptsDir: tmpDir, nodeEnv: "production" });

		const result1 = await loader.render("simple.ftl", { name: "Alice" });
		// Overwrite the file to verify cache is used
		await fsp.writeFile(path.join(tmpDir, "simple.ftl"), "Changed: ${name}!");
		const result2 = await loader.render("simple.ftl", { name: "Bob" });

		expect(result1).toBe("Hello, Alice!");
		expect(result2).toBe("Hello, Bob!");

		// Restore original file
		await fsp.writeFile(path.join(tmpDir, "simple.ftl"), "Hello, ${name}!");
	});

	it("does NOT cache in development mode", async () => {
		const loader = createPromptLoader({ promptsDir: tmpDir, nodeEnv: "development" });

		const result1 = await loader.render("simple.ftl", { name: "Alice" });
		await fsp.writeFile(path.join(tmpDir, "simple.ftl"), "Changed: ${name}!");
		const result2 = await loader.render("simple.ftl", { name: "Bob" });

		expect(result1).toBe("Hello, Alice!");
		expect(result2).toBe("Changed: Bob!");

		// Restore original file
		await fsp.writeFile(path.join(tmpDir, "simple.ftl"), "Hello, ${name}!");
	});

	it("does NOT cache in test mode", async () => {
		const loader = createPromptLoader({ promptsDir: tmpDir, nodeEnv: "test" });

		const result1 = await loader.render("simple.ftl", { name: "Alice" });
		await fsp.writeFile(path.join(tmpDir, "simple.ftl"), "Changed: ${name}!");
		const result2 = await loader.render("simple.ftl", { name: "Bob" });

		expect(result1).toBe("Hello, Alice!");
		expect(result2).toBe("Changed: Bob!");

		// Restore original file
		await fsp.writeFile(path.join(tmpDir, "simple.ftl"), "Hello, ${name}!");
	});

	it("handles template with no variables", async () => {
		const loader = createPromptLoader({ promptsDir: tmpDir, nodeEnv: "test" });

		const result = await loader.render("no-vars.ftl", {});

		expect(result).toBe("This template has no variables.");
	});

	it("throws PromptLoadError for unresolved variable placeholder", async () => {
		const loader = createPromptLoader({ promptsDir: tmpDir, nodeEnv: "test" });

		// simple.ftl has ${name} but we pass no variables
		await expect(loader.render("simple.ftl", {})).rejects.toThrow(PromptLoadError);

		try {
			await loader.render("simple.ftl", {});
		} catch (error) {
			expect(error).toBeInstanceOf(PromptLoadError);
			const promptError = error as PromptLoadError;
			expect(promptError.templateName).toBe("simple.ftl");
			expect(promptError.message).toContain("name");
		}
	});

	it("prevents path traversal attacks", async () => {
		const loader = createPromptLoader({ promptsDir: tmpDir, nodeEnv: "test" });

		await expect(loader.render("../../../etc/passwd", {})).rejects.toThrow(PromptLoadError);

		try {
			await loader.render("../../../etc/passwd", {});
		} catch (error) {
			expect(error).toBeInstanceOf(PromptLoadError);
			const promptError = error as PromptLoadError;
			expect(promptError.templateName).toBe("../../../etc/passwd");
			expect(promptError.message).toContain("path traversal");
		}
	});

	it("preserves literal text around variables", async () => {
		const loader = createPromptLoader({ promptsDir: tmpDir, nodeEnv: "test" });

		const result = await loader.render("surrounding.ftl", { middle: "CENTER" });

		expect(result).toBe("Before CENTER after");
	});

	it("handles subdirectory templates", async () => {
		const loader = createPromptLoader({ promptsDir: tmpDir, nodeEnv: "test" });

		const result = await loader.render("extraction/facts.ftl", { message: "I like cats" });

		expect(result).toBe("Extract facts from: I like cats");
	});

	it("auto-appends .ftl when extension is omitted", async () => {
		const loader = createPromptLoader({ promptsDir: tmpDir, nodeEnv: "test" });

		const result = await loader.render("simple", { name: "Alice" });

		expect(result).toBe("Hello, Alice!");
	});

	it("auto-appends .ftl for subdirectory templates without extension", async () => {
		const loader = createPromptLoader({ promptsDir: tmpDir, nodeEnv: "test" });

		const result = await loader.render("extraction/facts", { message: "I like cats" });

		expect(result).toBe("Extract facts from: I like cats");
	});

	it("rejects non-.ftl file extensions", async () => {
		const loader = createPromptLoader({ promptsDir: tmpDir, nodeEnv: "test" });

		await expect(loader.render("foo.json", {})).rejects.toThrow(PromptLoadError);

		try {
			await loader.render("foo.json", {});
		} catch (error) {
			expect(error).toBeInstanceOf(PromptLoadError);
			expect((error as PromptLoadError).message).toContain("only .ftl templates are supported");
		}
	});

	it("rejects empty template name", async () => {
		const loader = createPromptLoader({ promptsDir: tmpDir, nodeEnv: "test" });

		await expect(loader.render("", {})).rejects.toThrow(PromptLoadError);

		try {
			await loader.render("", {});
		} catch (error) {
			expect(error).toBeInstanceOf(PromptLoadError);
			expect((error as PromptLoadError).message).toContain("Invalid template name");
		}
	});

	it("rejects '.' and '..' as template names", async () => {
		const loader = createPromptLoader({ promptsDir: tmpDir, nodeEnv: "test" });

		await expect(loader.render(".", {})).rejects.toThrow(PromptLoadError);
		await expect(loader.render("..", {})).rejects.toThrow(PromptLoadError);
	});

	it("rejects absolute paths", async () => {
		const loader = createPromptLoader({ promptsDir: tmpDir, nodeEnv: "test" });

		await expect(loader.render("/etc/passwd", {})).rejects.toThrow(PromptLoadError);

		try {
			await loader.render("/etc/passwd", {});
		} catch (error) {
			expect(error).toBeInstanceOf(PromptLoadError);
			expect((error as PromptLoadError).message).toContain("absolute paths are not allowed");
		}
	});
});

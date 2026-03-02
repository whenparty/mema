import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
	createPromptLoader,
	loadAndRenderPromptTemplate,
	loadPromptTemplate,
	renderPromptTemplate,
} from "../prompt-loader";

describe("prompt-loader", () => {
	let tempDir: string;

	beforeEach(async () => {
		tempDir = await mkdtemp(path.join(os.tmpdir(), "mema-prompts-"));
	});

	afterEach(async () => {
		await rm(tempDir, { recursive: true, force: true });
	});

	it("loads template from prompts directory and appends .ftl extension", async () => {
		await mkdir(path.join(tempDir, "extraction"), { recursive: true });
		await writeFile(path.join(tempDir, "extraction", "combined.ftl"), "Hello ${name}!");

		const loader = createPromptLoader({ promptsDir: tempDir, nodeEnv: "test" });
		const content = await loader.load("extraction/combined");

		expect(content).toBe("Hello ${name}!");
	});

	it("rejects template path traversal", async () => {
		const loader = createPromptLoader({ promptsDir: tempDir, nodeEnv: "test" });

		await expect(loader.load("../outside")).rejects.toThrow(
			"Template path must stay inside prompts directory",
		);
	});

	it("keeps unresolved variables unchanged", () => {
		const loader = createPromptLoader({ promptsDir: tempDir, nodeEnv: "test" });

		const result = loader.render("Hi ${name}, ${unknown}!", new Map([["name", "Nii"]]));

		expect(result).toBe("Hi Nii, ${unknown}!");
	});

	it("renders variables and supports loadAndRender", async () => {
		await mkdir(path.join(tempDir, "generation"), { recursive: true });
		await writeFile(path.join(tempDir, "generation", "response.ftl"), "User ${userId}: ${message}");

		const loader = createPromptLoader({ promptsDir: tempDir, nodeEnv: "test" });
		const output = await loader.loadAndRender(
			"generation/response.ftl",
			new Map([
				["userId", "42"],
				["message", "Hello"],
			]),
		);

		expect(output).toBe("User 42: Hello");
	});

	it("hot reloads in development by reading changed file contents", async () => {
		await mkdir(path.join(tempDir, "summary"), { recursive: true });
		const templatePath = path.join(tempDir, "summary", "daily.ftl");

		await writeFile(templatePath, "v1");
		const loader = createPromptLoader({ promptsDir: tempDir, nodeEnv: "development" });

		expect(await loader.load("summary/daily")).toBe("v1");
		await writeFile(templatePath, "v2");
		expect(await loader.load("summary/daily")).toBe("v2");
	});

	it("reuses cache in non-development when template mtime is unchanged", async () => {
		await mkdir(path.join(tempDir, "summary"), { recursive: true });
		const templatePath = path.join(tempDir, "summary", "weekly.ftl");
		await writeFile(templatePath, "stable");

		const loader = createPromptLoader({ promptsDir: tempDir, nodeEnv: "test" });
		const first = await loader.load("summary/weekly");
		const second = await loader.load("summary/weekly");

		expect(first).toBe("stable");
		expect(second).toBe("stable");
	});

	it("exposes default helper APIs for loading and rendering", async () => {
		const template = await loadPromptTemplate("generation/response");
		expect(template).toContain("${user_message}");

		const rendered = renderPromptTemplate("Hello ${name}", new Map([["name", "Nii"]]));
		expect(rendered).toBe("Hello Nii");

		const combined = await loadAndRenderPromptTemplate(
			"generation/response",
			new Map([
				["user_summary", "likes coffee"],
				["relevant_memories", "met Alex yesterday"],
				["user_message", "what should I remember?"],
			]),
		);
		expect(combined).toContain("likes coffee");
		expect(combined).toContain("what should I remember?");
	});
});

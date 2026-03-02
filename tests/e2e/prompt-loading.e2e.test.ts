import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
	createPromptLoader,
	loadAndRenderPromptTemplate,
	loadPromptTemplate,
} from "@/infra/llm/provider";

describe("E2E: Prompt storage/loading/interpolation/hot-reload", () => {
	const tempDirs: string[] = [];

	afterEach(async () => {
		await Promise.all(tempDirs.map((dir) => rm(dir, { recursive: true, force: true })));
		tempDirs.length = 0;
	});

	it("loads prompt templates from repository prompts directory (AC1)", async () => {
		const template = await loadPromptTemplate("generation/response");

		expect(template).toContain("You are Mema, a personal memory assistant.");
		expect(template).toContain("${user_message}");
	});

	it("renders FreeMarker-style placeholders from variables map (AC2)", async () => {
		const rendered = await loadAndRenderPromptTemplate(
			"generation/response",
			new Map([
				["user_summary", "prefers concise replies"],
				["relevant_memories", "met Alex yesterday"],
				["user_message", "what should I remember?"],
			]),
		);

		expect(rendered).toContain("prefers concise replies");
		expect(rendered).toContain("met Alex yesterday");
		expect(rendered).toContain("what should I remember?");
		expect(rendered).not.toContain("${user_summary}");
		expect(rendered).not.toContain("${relevant_memories}");
		expect(rendered).not.toContain("${user_message}");
	});

	it("hot-reloads changed template content in development mode (AC3)", async () => {
		const promptsDir = await mkdtemp(path.join(os.tmpdir(), "mema-prompts-e2e-"));
		tempDirs.push(promptsDir);
		await mkdir(path.join(promptsDir, "generation"), { recursive: true });

		const templatePath = path.join(promptsDir, "generation", "response.ftl");
		await writeFile(templatePath, "v1 ${name}");

		const loader = createPromptLoader({ promptsDir, nodeEnv: "development" });

		const first = await loader.loadAndRender("generation/response", new Map([["name", "Nii"]]));
		expect(first).toBe("v1 Nii");

		await writeFile(templatePath, "v2 ${name}");

		const second = await loader.loadAndRender("generation/response", new Map([["name", "Nii"]]));
		expect(second).toBe("v2 Nii");
	});
});

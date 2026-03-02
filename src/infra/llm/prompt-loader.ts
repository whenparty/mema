import { readFile, stat } from "node:fs/promises";
import path from "node:path";

const TEMPLATE_VAR_REGEX = /\$\{([A-Za-z0-9_]+)\}/g;

export interface PromptLoaderOptions {
	promptsDir?: string;
	nodeEnv?: "development" | "production" | "test";
}

interface CachedTemplate {
	mtimeMs: number;
	content: string;
}

export interface PromptLoader {
	load(templatePath: string): Promise<string>;
	render(template: string, variables: ReadonlyMap<string, string>): string;
	loadAndRender(templatePath: string, variables: ReadonlyMap<string, string>): Promise<string>;
}

function resolvePromptPath(promptsDir: string, templatePath: string): string {
	const normalized = templatePath.replace(/\\/g, "/");
	const relativePath = normalized.endsWith(".ftl") ? normalized : `${normalized}.ftl`;
	const fullPath = path.resolve(promptsDir, relativePath);
	const relativeToRoot = path.relative(promptsDir, fullPath);

	if (relativeToRoot.startsWith("..") || path.isAbsolute(relativeToRoot)) {
		throw new Error(`Template path must stay inside prompts directory: ${templatePath}`);
	}

	return fullPath;
}

export function createPromptLoader(options: PromptLoaderOptions = {}): PromptLoader {
	const promptsDir = options.promptsDir ?? path.join(process.cwd(), "prompts");
	const nodeEnv = options.nodeEnv ?? process.env.NODE_ENV ?? "development";
	const templateCache = new Map<string, CachedTemplate>();
	const useCache = nodeEnv !== "development";

	async function load(templatePath: string): Promise<string> {
		const fullPath = resolvePromptPath(promptsDir, templatePath);
		const stats = await stat(fullPath);
		const cached = templateCache.get(fullPath);

		if (useCache && cached && cached.mtimeMs === stats.mtimeMs) {
			return cached.content;
		}

		const content = await readFile(fullPath, "utf-8");

		if (useCache) {
			templateCache.set(fullPath, { mtimeMs: stats.mtimeMs, content });
		}

		return content;
	}

	function render(template: string, variables: ReadonlyMap<string, string>): string {
		return template.replaceAll(TEMPLATE_VAR_REGEX, (match, key: string) => {
			const value = variables.get(key);
			return value === undefined ? match : value;
		});
	}

	async function loadAndRender(
		templatePath: string,
		variables: ReadonlyMap<string, string>,
	): Promise<string> {
		const template = await load(templatePath);
		return render(template, variables);
	}

	return {
		load,
		render,
		loadAndRender,
	};
}

const defaultPromptLoader = createPromptLoader();

export async function loadPromptTemplate(templatePath: string): Promise<string> {
	return defaultPromptLoader.load(templatePath);
}

export function renderPromptTemplate(
	template: string,
	variables: ReadonlyMap<string, string>,
): string {
	return defaultPromptLoader.render(template, variables);
}

export async function loadAndRenderPromptTemplate(
	templatePath: string,
	variables: ReadonlyMap<string, string>,
): Promise<string> {
	return defaultPromptLoader.loadAndRender(templatePath, variables);
}

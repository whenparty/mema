import * as fsp from "node:fs/promises";
import * as path from "node:path";
import { PromptLoadError } from "@/shared/errors";
import { createChildLogger } from "@/shared/logger";

export interface PromptLoader {
	render(templateName: string, variables: Record<string, string>): Promise<string>;
}

interface PromptLoaderConfig {
	promptsDir: string;
	nodeEnv: "development" | "production" | "test";
}

const VARIABLE_PATTERN = /\$\{(\w+)\}/g;

export function createPromptLoader(config: PromptLoaderConfig): PromptLoader {
	const log = createChildLogger({ module: "prompt-loader" });
	const cache = new Map<string, string>();
	const useCache = config.nodeEnv === "production";

	async function loadTemplate(templateName: string): Promise<string> {
		if (useCache) {
			const cached = cache.get(templateName);
			if (cached !== undefined) {
				return cached;
			}
		}

		const fullPath = path.resolve(config.promptsDir, templateName);
		const normalizedBase = path.resolve(config.promptsDir);

		if (!fullPath.startsWith(`${normalizedBase}${path.sep}`) && fullPath !== normalizedBase) {
			throw new PromptLoadError(
				`Refused to load template: path traversal detected for "${templateName}"`,
				templateName,
			);
		}

		let rawTemplate: string;
		try {
			rawTemplate = await fsp.readFile(fullPath, "utf-8");
		} catch (error) {
			throw new PromptLoadError(
				`Failed to load template "${templateName}": file not found or not readable`,
				templateName,
				error,
			);
		}

		if (useCache) {
			cache.set(templateName, rawTemplate);
			log.debug({ templateName }, "template cached");
		}

		return rawTemplate;
	}

	function interpolate(
		rawTemplate: string,
		variables: Record<string, string>,
		templateName: string,
	): string {
		return rawTemplate.replace(VARIABLE_PATTERN, (match, key: string) => {
			const value = variables[key];
			if (value === undefined) {
				throw new PromptLoadError(
					`Missing variable "${key}" in template "${templateName}"`,
					templateName,
				);
			}
			return value;
		});
	}

	return {
		async render(templateName: string, variables: Record<string, string>): Promise<string> {
			log.debug({ templateName }, "rendering template");
			const rawTemplate = await loadTemplate(templateName);
			return interpolate(rawTemplate, variables, templateName);
		},
	};
}

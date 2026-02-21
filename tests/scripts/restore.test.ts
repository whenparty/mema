import { constants, accessSync, readFileSync, statSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const RESTORE_SCRIPT = resolve(__dirname, "../../scripts/restore.sh");

describe("scripts/restore.sh", () => {
	const content = (() => {
		try {
			return readFileSync(RESTORE_SCRIPT, "utf-8");
		} catch {
			return "";
		}
	})();

	it("exists and is readable", () => {
		expect(() => accessSync(RESTORE_SCRIPT, constants.R_OK)).not.toThrow();
	});

	it("starts with bash shebang", () => {
		expect(content).toMatch(/^#!\/usr\/bin\/env bash/);
	});

	it("uses strict mode (set -euo pipefail)", () => {
		expect(content).toContain("set -euo pipefail");
	});

	it("validates required environment variables", () => {
		for (const envVar of [
			"B2_APPLICATION_KEY_ID",
			"B2_APPLICATION_KEY",
			"B2_BUCKET_NAME",
			"POSTGRES_DB",
			"POSTGRES_USER",
			"POSTGRES_PASSWORD",
		]) {
			expect(content).toContain(envVar);
		}
	});

	it("accepts a positional argument for backup filename", () => {
		// Script should check for $1 or show usage
		expect(content).toMatch(/\$1|usage/i);
	});

	it("downloads from S3-compatible endpoint", () => {
		expect(content).toMatch(/aws s3 cp/);
		expect(content).toMatch(/--endpoint-url/);
	});

	it("checks for required commands (aws, docker compose)", () => {
		expect(content).toContain("command -v");
		expect(content).toMatch(/\baws\b/);
		expect(content).toMatch(/docker compose version/);
	});

	it("uses pg_restore with clean, if-exists, and verbose flags", () => {
		expect(content).toMatch(/pg_restore/);
		expect(content).toMatch(/--clean/);
		expect(content).toMatch(/--if-exists/);
		expect(content).toMatch(/--verbose/);
	});

	it("lists available backups when no argument provided", () => {
		expect(content).toMatch(/aws s3 ls/);
	});

	it("is executable", () => {
		const stats = statSync(RESTORE_SCRIPT);
		expect(stats.mode & 0o111).toBeGreaterThan(0);
	});
});

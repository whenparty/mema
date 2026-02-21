import { constants, accessSync, readFileSync, statSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const BACKUP_SCRIPT = resolve(__dirname, "../../scripts/backup.sh");

describe("scripts/backup.sh", () => {
	const content = (() => {
		try {
			return readFileSync(BACKUP_SCRIPT, "utf-8");
		} catch {
			return "";
		}
	})();

	it("exists and is readable", () => {
		expect(() => accessSync(BACKUP_SCRIPT, constants.R_OK)).not.toThrow();
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

	it("generates timestamp-based backup filename", () => {
		expect(content).toMatch(/mema-backup-/);
	});

	it("uses pg_dump with custom format", () => {
		expect(content).toMatch(/pg_dump/);
		expect(content).toMatch(/--format=custom/);
	});

	it("uploads to S3-compatible endpoint", () => {
		expect(content).toMatch(/aws s3 cp/);
		expect(content).toMatch(/--endpoint-url/);
	});

	it("cleans up local dump file after upload", () => {
		expect(content).toMatch(/rm\s.*-f/);
	});

	it("checks for required commands (aws, docker compose)", () => {
		expect(content).toContain("command -v");
		expect(content).toMatch(/\baws\b/);
		expect(content).toMatch(/docker compose version/);
	});

	it("includes 7-day retention cleanup", () => {
		expect(content).toMatch(/7 days/);
		expect(content).toMatch(/s3 rm/);
	});

	it("is executable", () => {
		const stats = statSync(BACKUP_SCRIPT);
		// Check that at least one execute bit is set
		expect(stats.mode & 0o111).toBeGreaterThan(0);
	});
});

describe(".env.example B2 variables", () => {
	const envExample = (() => {
		try {
			return readFileSync(resolve(__dirname, "../../.env.example"), "utf-8");
		} catch {
			return "";
		}
	})();

	it("includes B2_APPLICATION_KEY_ID", () => {
		expect(envExample).toContain("B2_APPLICATION_KEY_ID");
	});

	it("includes B2_APPLICATION_KEY", () => {
		expect(envExample).toContain("B2_APPLICATION_KEY");
	});

	it("includes B2_BUCKET_NAME", () => {
		expect(envExample).toContain("B2_BUCKET_NAME");
	});

	it("includes B2_ENDPOINT_URL", () => {
		expect(envExample).toContain("B2_ENDPOINT_URL");
	});
});

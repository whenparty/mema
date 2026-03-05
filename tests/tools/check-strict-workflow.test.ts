import { constants, accessSync, readFileSync, statSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const CHECK_SCRIPT = resolve(__dirname, "../../tools/check-strict-workflow.sh");

describe("tools/check-strict-workflow.sh", () => {
	const content = (() => {
		try {
			return readFileSync(CHECK_SCRIPT, "utf-8");
		} catch {
			return "";
		}
	})();

	it("exists and is readable", () => {
		expect(() => accessSync(CHECK_SCRIPT, constants.R_OK)).not.toThrow();
	});

	it("starts with bash shebang", () => {
		expect(content).toMatch(/^#!\/usr\/bin\/env bash/);
	});

	it("uses strict mode (set -euo pipefail)", () => {
		expect(content).toContain("set -euo pipefail");
	});

	it("validates required workflow artifacts", () => {
		for (const artifact of [
			"issue.md",
			"context-product.md",
			"context-tech.md",
			"context-validation.md",
			"plan-a.md",
			"plan-b.md",
			"plan-c.md",
			"design-review.md",
			"selected-plan.md",
			"plan-verification.md",
			"implementer-core.md",
			"implementer-test.md",
			"implementer-e2e.md",
			"e2e-report.md",
			"review-a.md",
			"review-b.md",
			"run-log.md",
			"workflow-state.md",
		]) {
			expect(content).toContain(`check_file_nonempty "${artifact}"`);
		}
	});

	it("checks verdict semantics for gate artifacts", () => {
		expect(content).toContain("WINNER_A|WINNER_B|WINNER_C|HYBRID");
		expect(content).toContain("Verdict:");
		expect(content).toContain("PASS");
		expect(content).toContain("APPROVED");
	});

	it("enforces traceability sections in key artifacts", () => {
		expect(content).toContain("check_section_min_items");
		expect(content).toContain('check_traceability_sections "plan-a.md"');
		expect(content).toContain('check_traceability_sections "plan-b.md"');
		expect(content).toContain('check_traceability_sections "plan-c.md"');
		expect(content).toContain('check_traceability_sections "design-review.md"');
		expect(content).toContain('check_traceability_sections "plan-verification.md"');
		expect(content).toContain('check_traceability_sections "implementer-core.md"');
		expect(content).toContain('check_traceability_sections "implementer-test.md"');
		expect(content).toContain('check_traceability_sections "implementer-e2e.md"');
		expect(content).toContain('check_traceability_sections "review-a.md"');
		expect(content).toContain('check_traceability_sections "review-b.md"');
		expect(content).toContain("Inputs consumed has >= ${min_inputs} items");
		expect(content).toContain("Evidence map has >= ${min_evidence} items");
		expect(content).toContain("context-product\\\\.md");
		expect(content).toContain("context-tech\\\\.md");
	});

	it("checks step invocation evidence from run-log", () => {
		expect(content).toContain("STEP 1: github-agent intake");
		expect(content).toContain("STEP 2: context-builder-product");
		expect(content).toContain("STEP 3: context-builder-tech");
		expect(content).toContain("STEP 4: context-validation");
		expect(content).toContain("STEP 8: implementer-core");
		expect(content).toContain("STEP 9: implementer-test");
		expect(content).toContain("STEP 10: implementer-e2e");
		expect(content).toContain("STEP 14: compliance-checker");
		expect(content).toContain("STEP 15: post-compliance");
		expect(content).toContain("STEP 16: github-agent finalize");
	});

	it("is executable", () => {
		const stats = statSync(CHECK_SCRIPT);
		expect(stats.mode & 0o111).toBeGreaterThan(0);
	});
});

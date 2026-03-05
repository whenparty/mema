#!/usr/bin/env bash
set -euo pipefail

POST_MODE=false
TASK_DIR=""

for arg in "$@"; do
	case "${arg}" in
		--post) POST_MODE=true ;;
		*) TASK_DIR="${arg}" ;;
	esac
done
TASK_DIR="${TASK_DIR:-.task}"

FAILURES=0

pass() {
	echo "PASS: $1"
}

fail() {
	echo "FAIL: $1"
	FAILURES=$((FAILURES + 1))
}

check_file_nonempty() {
	local file="$1"
	if [[ -s "${TASK_DIR}/${file}" ]]; then
		pass "artifact exists: ${file}"
	else
		fail "artifact missing or empty: ${file}"
	fi
}

check_regex() {
	local file="$1"
	local regex="$2"
	local label="$3"
	if [[ ! -f "${TASK_DIR}/${file}" ]]; then
		fail "${label} (file missing: ${file})"
		return
	fi
	if rg -n -e "${regex}" "${TASK_DIR}/${file}" >/dev/null 2>&1; then
		pass "${label}"
	else
		fail "${label}"
	fi
}

check_no_regex() {
	local file="$1"
	local regex="$2"
	local label="$3"
	if [[ ! -f "${TASK_DIR}/${file}" ]]; then
		fail "${label} (file missing: ${file})"
		return
	fi
	if rg -n -e "${regex}" "${TASK_DIR}/${file}" >/dev/null 2>&1; then
		fail "${label}"
	else
		pass "${label}"
	fi
}

check_traceability_sections() {
	local file="$1"
	local label="$2"
	local min_inputs="${3:-2}"
	local min_evidence="${4:-2}"
	check_regex "${file}" "^Inputs consumed:" "${label} has Inputs consumed section"
	check_regex "${file}" "^Evidence map:" "${label} has Evidence map section"
	check_section_min_items "${file}" "Inputs consumed" "${min_inputs}" "${label} Inputs consumed has >= ${min_inputs} items"
	check_section_min_items "${file}" "Evidence map" "${min_evidence}" "${label} Evidence map has >= ${min_evidence} items"
}

check_section_min_items() {
	local file="$1"
	local section="$2"
	local min_items="$3"
	local label="$4"
	if [[ ! -f "${TASK_DIR}/${file}" ]]; then
		fail "${label} (file missing: ${file})"
		return
	fi

	local count
	count="$(
		awk -v section="${section}" '
			BEGIN { in_section = 0; count = 0 }
			$0 == section ":" { in_section = 1; next }
			in_section && $0 ~ /^[A-Za-z][A-Za-z0-9 \/\(\)_\.\`\-]*:$/ { in_section = 0 }
			in_section && $0 ~ /^- / { count++ }
			END { print count }
		' "${TASK_DIR}/${file}"
	)"

	if (( count >= min_items )); then
		pass "${label}"
	else
		fail "${label} (found ${count})"
	fi
}

check_step_order() {
	local log_file="${TASK_DIR}/run-log.md"
	local -a steps=(
		"STEP 1: github-agent intake"
		"STEP 2: context-builder-product"
		"STEP 3: context-builder-tech"
		"STEP 4: context-validation"
		"STEP 5: planner-a"
		"STEP 5: planner-b"
		"STEP 5: planner-c"
		"STEP 6: design-reviewer"
		"STEP 7: plan-verifier"
		"STEP 8: implementer-core"
		"STEP 9: implementer-test"
		"STEP 10: implementer-e2e"
		"STEP 11: docker-e2e-runner"
		"STEP 12: code-reviewer-a"
		"STEP 13: code-reviewer-b"
		"STEP 14: compliance-checker"
		"STEP 15: post-compliance"
		"STEP 16: github-agent finalize"
	)

	local prev_line=0
	for step in "${steps[@]}"; do
		local line
		line="$(rg -n -m 1 -e "^- ${step}" "${log_file}" | cut -d: -f1 || true)"
		if [[ -z "${line}" ]]; then
			fail "run-log missing step: ${step}"
			continue
		fi
		if (( line < prev_line )); then
			fail "run-log out-of-order step: ${step}"
		else
			pass "run-log step present/in-order: ${step}"
		fi
		prev_line="${line}"
	done
}

check_plan_required_sections() {
	local file="$1"
	local label="$2"
	local -a sections=(
		"Architecture watch"
		"Design decisions"
		"Scope boundary"
		"Docs index snapshot"
		"AC coverage"
		"Edge cases"
		"Evidence map"
		"Inputs consumed"
	)
	for section in "${sections[@]}"; do
		if rg -n -i -e "^#+\s*${section}" "${TASK_DIR}/${file}" >/dev/null 2>&1 ||
		   rg -n -e "^${section}:" "${TASK_DIR}/${file}" >/dev/null 2>&1; then
			pass "${label} has section: ${section}"
		else
			fail "${label} missing section: ${section}"
		fi
	done
}

check_plan_design_axes() {
	local file="$1"
	local label="$2"
	if [[ ! -f "${TASK_DIR}/${file}" ]]; then
		fail "${label} DA check (file missing: ${file})"
		return
	fi

	local da_count
	da_count="$(rg -c -e "^- DA" "${TASK_DIR}/${file}" 2>/dev/null || echo 0)"
	if (( da_count >= 1 )); then
		pass "${label} has >= 1 design axis (found ${da_count})"
	else
		fail "${label} has no design axes (DA-N entries)"
	fi

	local rejected_count
	rejected_count="$(rg -c -i -e "Rejected:" "${TASK_DIR}/${file}" 2>/dev/null || echo 0)"
	if (( rejected_count >= 1 )); then
		pass "${label} has rejected alternatives (found ${rejected_count})"
	else
		fail "${label} missing rejected alternatives in design decisions"
	fi
}

check_compliance_report() {
	check_file_nonempty "compliance-report.md"
	check_regex "compliance-report.md" "Verdict:\\s*(PASS|FAIL)" "compliance-report has verdict"

	if rg -n -e "Verdict:\\s*FAIL" "${TASK_DIR}/compliance-report.md" >/dev/null 2>&1; then
		fail "compliance-report verdict is FAIL (pipeline did not pass compliance)"
	else
		pass "compliance-report verdict is not FAIL"
	fi

	check_regex "compliance-report.md" "Script check" "compliance-report includes script check result"
	check_regex "compliance-report.md" "Artifact completeness" "compliance-report includes artifact completeness result"
}

check_needs_replanning_branch() {
	local has_replan
	has_replan="$(
		rg -n -e "NEEDS_REPLANNING" \
			"${TASK_DIR}/implementer-core.md" \
			"${TASK_DIR}/implementer-test.md" \
			"${TASK_DIR}/implementer-e2e.md" \
			"${TASK_DIR}/review-a.md" \
			"${TASK_DIR}/review-b.md" \
			>/dev/null 2>&1 && echo yes || echo no
	)"

	if [[ "${has_replan}" == "no" ]]; then
		pass "NEEDS_REPLANNING branch not required"
		return
	fi

	if [[ -s "${TASK_DIR}/replan-request.md" ]]; then
		pass "replan-request artifact present"
	else
		fail "NEEDS_REPLANNING detected but replan-request artifact missing"
	fi

	if rg -n -e "replan-request\\.md" "${TASK_DIR}/context-product.md" "${TASK_DIR}/context-tech.md" >/dev/null 2>&1; then
		pass "context artifacts include replan evidence reference"
	else
		fail "context artifacts missing replan evidence reference"
	fi
}

if [[ "${POST_MODE}" == true ]]; then
	echo "=== Post-compliance checks ==="
	check_compliance_report
else
	echo "=== Artifact existence ==="
	check_file_nonempty "issue.md"
	check_file_nonempty "context-product.md"
	check_file_nonempty "context-tech.md"
	check_file_nonempty "context-validation.md"
	check_file_nonempty "plan-a.md"
	check_file_nonempty "plan-b.md"
	check_file_nonempty "plan-c.md"
	check_file_nonempty "design-review.md"
	check_file_nonempty "selected-plan.md"
	check_file_nonempty "plan-verification.md"
	check_file_nonempty "implementer-core.md"
	check_file_nonempty "implementer-test.md"
	check_file_nonempty "implementer-e2e.md"
	check_file_nonempty "e2e-report.md"
	check_file_nonempty "review-a.md"
	check_file_nonempty "review-b.md"
	check_file_nonempty "run-log.md"
	check_file_nonempty "workflow-state.md"

	echo "=== Verdict checks ==="
	check_regex "design-review.md" "Verdict:\\s*(WINNER_A|WINNER_B|WINNER_C|HYBRID)" "design-review verdict is valid"
	check_regex "plan-verification.md" "Verdict:\\s*PASS" "plan-verifier verdict is PASS"
	check_regex "e2e-report.md" "Verdict:\\s*PASS|All tests pass" "docker e2e evidence is PASS"
	check_regex "review-a.md" "Verdict:\\s*APPROVED" "review-a verdict is APPROVED"
	check_regex "review-b.md" "Verdict:\\s*APPROVED" "review-b verdict is APPROVED"
	check_no_regex "workflow-state.md" "status:\\s*completed\\s+verdict:\\s*(FAIL|NEEDS_REVISION|NEEDS_REWORK|NEEDS_REPLANNING)" "workflow-state does not complete failed gates"

	echo "=== Traceability ==="
	check_traceability_sections "plan-a.md" "plan-a"
	check_traceability_sections "plan-b.md" "plan-b"
	check_traceability_sections "plan-c.md" "plan-c"
	check_traceability_sections "design-review.md" "design-review"
	check_traceability_sections "plan-verification.md" "plan-verification"
	check_traceability_sections "implementer-core.md" "implementer-core"
	check_traceability_sections "implementer-test.md" "implementer-test"
	check_traceability_sections "implementer-e2e.md" "implementer-e2e"
	check_traceability_sections "review-a.md" "review-a"
	check_traceability_sections "review-b.md" "review-b"

	check_regex "plan-a.md" "context-product\\.md" "plan-a references context-product input"
	check_regex "plan-a.md" "context-tech\\.md" "plan-a references context-tech input"
	check_regex "plan-b.md" "context-product\\.md" "plan-b references context-product input"
	check_regex "plan-b.md" "context-tech\\.md" "plan-b references context-tech input"
	check_regex "plan-c.md" "context-product\\.md" "plan-c references context-product input"
	check_regex "plan-c.md" "context-tech\\.md" "plan-c references context-tech input"

	echo "=== Plan structure ==="
	check_plan_required_sections "plan-a.md" "plan-a"
	check_plan_required_sections "plan-b.md" "plan-b"
	check_plan_required_sections "plan-c.md" "plan-c"
	check_plan_required_sections "selected-plan.md" "selected-plan"

	echo "=== Design axis quality ==="
	check_plan_design_axes "plan-a.md" "plan-a"
	check_plan_design_axes "plan-b.md" "plan-b"
	check_plan_design_axes "plan-c.md" "plan-c"
	check_plan_design_axes "selected-plan.md" "selected-plan"

	echo "=== Step ordering ==="
	check_step_order
	check_needs_replanning_branch
fi

if (( FAILURES > 0 )); then
	echo "RESULT: FAIL (${FAILURES} checks failed)"
	exit 1
fi

echo "RESULT: PASS"

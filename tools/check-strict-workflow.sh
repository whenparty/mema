#!/usr/bin/env bash
set -euo pipefail

POST_MODE=false
JSON_MODE=false
TASK_DIR=""

for arg in "$@"; do
	case "${arg}" in
		--post) POST_MODE=true ;;
		--json) JSON_MODE=true ;;
		*) TASK_DIR="${arg}" ;;
	esac
done

TASK_DIR="${TASK_DIR:-.task}"
FAILURES=0
TOTAL=0
CURRENT_CATEGORY=""
RESULTS_FILE="$(mktemp)"
trap 'rm -f "${RESULTS_FILE}"' EXIT

if command -v rg >/dev/null 2>&1; then
	RG="rg"
else
	RG="grep -E"
fi

begin_category() {
	CURRENT_CATEGORY="$1"
	if [[ "${JSON_MODE}" == false ]]; then
		echo "=== $1 ==="
	fi
}

pass() {
	local label="$1"
	TOTAL=$((TOTAL + 1))
	printf '%s\t%s\tpass\n' "${CURRENT_CATEGORY}" "${label}" >> "${RESULTS_FILE}"
	if [[ "${JSON_MODE}" == false ]]; then
		echo "PASS: ${label}"
	fi
}

fail() {
	local label="$1"
	TOTAL=$((TOTAL + 1))
	FAILURES=$((FAILURES + 1))
	printf '%s\t%s\tfail\n' "${CURRENT_CATEGORY}" "${label}" >> "${RESULTS_FILE}"
	if [[ "${JSON_MODE}" == false ]]; then
		echo "FAIL: ${label}"
	fi
}

emit_json() {
	local result="PASS"
	if (( FAILURES > 0 )); then
		result="FAIL"
	fi

	awk -F'\t' -v total="${TOTAL}" -v failures="${FAILURES}" -v result="${result}" '
	function json_escape(s) {
		gsub(/\\/, "\\\\", s)
		gsub(/"/, "\\\"", s)
		return s
	}
	BEGIN {
		n_cat = 0
	}
	{
		cat = $1; label = $2; res = $3
		if (!(cat in cat_idx)) {
			cat_idx[cat] = n_cat
			cat_names[n_cat] = cat
			cat_pass[n_cat] = 0
			cat_fail[n_cat] = 0
			cat_checks[n_cat] = ""
			n_cat++
		}
		ci = cat_idx[cat]
		if (res == "pass") cat_pass[ci]++; else cat_fail[ci]++
		sep = (cat_checks[ci] == "") ? "" : ","
		cat_checks[ci] = cat_checks[ci] sep \
			sprintf("{\"label\":\"%s\",\"result\":\"%s\"}", json_escape(label), res)
	}
	END {
		printf "{\n"
		printf "  \"result\": \"%s\",\n", result
		printf "  \"total\": %d,\n", total
		printf "  \"failures\": %d,\n", failures
		printf "  \"categories\": {\n"
		for (i = 0; i < n_cat; i++) {
			cname = cat_names[i]
			gsub(/ /, "_", cname)
			gsub(/[^a-zA-Z0-9_]/, "", cname)
			printf "    \"%s\": {\n", tolower(cname)
			printf "      \"pass\": %d,\n", cat_pass[i]
			printf "      \"fail\": %d,\n", cat_fail[i]
			printf "      \"checks\": [%s]\n", cat_checks[i]
			if (i < n_cat - 1) printf "    },\n"; else printf "    }\n"
		}
		printf "  }\n"
		printf "}\n"
	}
	' "${RESULTS_FILE}"
}

check_file_exists() {
	local file="$1"
	if [[ -f "${TASK_DIR}/${file}" ]]; then
		pass "artifact exists: ${file}"
	else
		fail "artifact missing: ${file}"
	fi
}

check_file_nonempty() {
	local file="$1"
	if [[ -s "${TASK_DIR}/${file}" ]]; then
		pass "artifact exists: ${file}"
	else
		fail "artifact missing or empty: ${file}"
	fi
}

check_file_absent() {
	local file="$1"
	if [[ -e "${TASK_DIR}/${file}" ]]; then
		fail "legacy artifact must be absent: ${file}"
	else
		pass "legacy artifact absent: ${file}"
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
	if ${RG} -n -e "${regex}" "${TASK_DIR}/${file}" >/dev/null 2>&1; then
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
	if ${RG} -n -e "${regex}" "${TASK_DIR}/${file}" >/dev/null 2>&1; then
		fail "${label}"
	else
		pass "${label}"
	fi
}

check_heading_once() {
	local file="$1"
	local heading="$2"
	local label="$3"
	if [[ ! -f "${TASK_DIR}/${file}" ]]; then
		fail "${label} (file missing: ${file})"
		return
	fi
	local count
	count="$(${RG} -c -e "^${heading}$" "${TASK_DIR}/${file}" 2>/dev/null || true)"
	count="$(printf '%s\n' "${count:-0}" | tail -n 1)"
	if (( count == 1 )); then
		pass "${label}"
	else
		fail "${label} (found ${count})"
	fi
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
			function lower(s) { return tolower(s) }
			BEGIN { in_section = 0; count = 0; target = lower(section) }
			lower($0) ~ "^##[[:space:]]+" target "$" { in_section = 1; next }
			in_section && $0 ~ /^## / { in_section = 0 }
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

check_traceability_sections() {
	local file="$1"
	local label="$2"
	local min_inputs="${3:-2}"
	local min_evidence="${4:-2}"
	check_regex "${file}" "^##[[:space:]]+Inputs Consumed$" "${label} has Inputs Consumed"
	check_regex "${file}" "^##[[:space:]]+Evidence Map$" "${label} has Evidence Map"
	check_section_min_items "${file}" "Inputs Consumed" "${min_inputs}" "${label} Inputs Consumed has >= ${min_inputs} items"
	check_section_min_items "${file}" "Evidence Map" "${min_evidence}" "${label} Evidence Map has >= ${min_evidence} items"
}

check_source_ids_present() {
	local file="$1"
	local label="$2"
	check_regex "${file}" "source_id:" "${label} includes source_id traceability"
}

check_step_order() {
	local log_file="${TASK_DIR}/run-log.md"
	local -a steps=(
		"STEP 1: issue intake"
		"STEP 2: context-builder-product"
		"STEP 3: context-builder-tech"
		"STEP 4a: problem-analyst intake"
		"STEP 4b: problem-analyst problem-framing"
		"STEP 5a: requirement-shaping"
		"STEP 5b: option-generation"
		"STEP 5c: design-consolidation"
		"STEP 6a: critic challenge-review"
		"STEP 6b: delivery-planner"
		"STEP 6c: spec-writer"
		"STEP 7a: plan-verifier"
		"STEP 7b: spec-verifier"
		"STEP 8: github-ops branch"
		"STEP 9: implementer-test"
		"STEP 10: implementer-core"
		"STEP 11: implementer-integration"
		"STEP 12: integration-runner"
		"STEP 13: code-reviewer-a"
		"STEP 13: code-reviewer-b"
		"STEP 14: compliance-checker"
	)

	local prev_line=0
	for step in "${steps[@]}"; do
		local line
		line="$(${RG} -n -m 1 -e "^- ${step}" "${log_file}" | cut -d: -f1 || true)"
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

check_issue_packet_contract() {
	check_heading_once "issue.md" "# Issue Packet" "issue packet has single title"
	check_heading_once "issue.md" "## Metadata" "issue packet has Metadata"
	check_heading_once "issue.md" "## Raw Issue Body" "issue packet has Raw Issue Body"
	check_heading_once "issue.md" "## Dependencies" "issue packet has Dependencies"
	check_heading_once "issue.md" "## Git State" "issue packet has Git State"
	check_heading_once "issue.md" "## Intake Notes" "issue packet has Intake Notes"
	check_heading_once "issue.md" "<<<ISSUE_BODY_START" "issue packet has issue body start delimiter"
	check_heading_once "issue.md" ">>>ISSUE_BODY_END" "issue packet has issue body end delimiter"
	check_regex "issue.md" "planning_bundle:" "issue packet has planning_bundle metadata"
	check_regex "issue.md" "implement_now:" "issue packet has implement_now metadata"
	check_regex "issue.md" "planning_bundle_reason:" "issue packet has planning_bundle_reason metadata"
}

check_product_context_contract() {
	check_heading_once "context-product.md" "# Product Context Packet" "product packet has title"
	check_heading_once "context-product.md" "## Packet Metadata" "product packet has Packet Metadata"
	check_heading_once "context-product.md" "## Task Framing" "product packet has Task Framing"
	check_heading_once "context-product.md" "## Acceptance Criteria" "product packet has Acceptance Criteria"
	check_heading_once "context-product.md" "## References" "product packet has References"
	check_heading_once "context-product.md" "### Product Behavior" "product packet has Product Behavior"
	check_heading_once "context-product.md" "### Backlog And Milestone" "product packet has Backlog And Milestone"
	check_heading_once "context-product.md" "## Docs Index Snapshot" "product packet has Docs Index Snapshot"
	check_heading_once "context-product.md" "## Scope Hints" "product packet has Scope Hints"
	check_source_ids_present "context-product.md" "product packet"
}

check_tech_context_contract() {
	check_heading_once "context-tech.md" "# Technical Context Packet" "tech packet has title"
	check_heading_once "context-tech.md" "## Packet Metadata" "tech packet has Packet Metadata"
	check_heading_once "context-tech.md" "## Task Framing" "tech packet has Task Framing"
	check_heading_once "context-tech.md" "## Architecture Constraints" "tech packet has Architecture Constraints"
	check_heading_once "context-tech.md" "## Decision Docs" "tech packet has Decision Docs"
	check_heading_once "context-tech.md" "## Key Interfaces And Contracts" "tech packet has Key Interfaces And Contracts"
	check_heading_once "context-tech.md" "## Existing Implementation" "tech packet has Existing Implementation"
	check_heading_once "context-tech.md" "## Docs Index Snapshot" "tech packet has Docs Index Snapshot"
	check_source_ids_present "context-tech.md" "tech packet"
}

check_planning_context_contract() {
	check_heading_once "planning-context.md" "# Planning Context" "planning-context has title"
	check_heading_once "planning-context.md" "## Context Metadata" "planning-context has Context Metadata"
	check_heading_once "planning-context.md" "## Facts" "planning-context has Facts"
	check_heading_once "planning-context.md" "## Assumptions" "planning-context has Assumptions"
	check_heading_once "planning-context.md" "## Unknowns" "planning-context has Unknowns"
	check_heading_once "planning-context.md" "## Problem Statement" "planning-context has Problem Statement"
	check_heading_once "planning-context.md" "## Success Criteria" "planning-context has Success Criteria"
	check_heading_once "planning-context.md" "## Requirements" "planning-context has Requirements"
	check_heading_once "planning-context.md" "## Constraints" "planning-context has Constraints"
	check_heading_once "planning-context.md" "## Options" "planning-context has Options"
	check_heading_once "planning-context.md" "## Tradeoffs" "planning-context has Tradeoffs"
	check_heading_once "planning-context.md" "## Chosen Design" "planning-context has Chosen Design"
	check_heading_once "planning-context.md" "## Rejected Alternatives" "planning-context has Rejected Alternatives"
	check_heading_once "planning-context.md" "## Risks And Mitigations" "planning-context has Risks And Mitigations"
	check_heading_once "planning-context.md" "## Phases And Dependencies" "planning-context has Phases And Dependencies"
	check_heading_once "planning-context.md" "## Decision Log" "planning-context has Decision Log"
	check_source_ids_present "planning-context.md" "planning-context"
}

check_selected_plan_contract() {
	check_heading_once "selected-plan.md" "# Selected Plan" "selected-plan has title"
	check_heading_once "selected-plan.md" "## Summary" "selected-plan has Summary"
	check_heading_once "selected-plan.md" "## Inputs Consumed" "selected-plan has Inputs Consumed"
	check_heading_once "selected-plan.md" "## Assumptions" "selected-plan has Assumptions"
	check_heading_once "selected-plan.md" "## Docs Index Snapshot" "selected-plan has Docs Index Snapshot"
	check_heading_once "selected-plan.md" "## Architecture Watch" "selected-plan has Architecture Watch"
	check_heading_once "selected-plan.md" "## Design Decisions" "selected-plan has Design Decisions"
	check_heading_once "selected-plan.md" "## Backlog And Milestone Boundary Check" "selected-plan has Backlog Boundary"
	check_heading_once "selected-plan.md" "## Scope Boundary" "selected-plan has Scope Boundary"
	check_heading_once "selected-plan.md" "## Files" "selected-plan has Files"
	check_heading_once "selected-plan.md" "## Implementation Steps" "selected-plan has Implementation Steps"
	check_heading_once "selected-plan.md" "## AC Coverage" "selected-plan has AC Coverage"
	check_heading_once "selected-plan.md" "## Edge Cases / Failure Modes" "selected-plan has Edge Cases"
	check_heading_once "selected-plan.md" "## Evidence Map" "selected-plan has Evidence Map"
	check_heading_once "selected-plan.md" "## Risks And Rollback" "selected-plan has Risks And Rollback"
	check_heading_once "selected-plan.md" "## Phases And Dependencies" "selected-plan has Phases And Dependencies"
	check_source_ids_present "selected-plan.md" "selected-plan"
	check_regex "selected-plan.md" "implement_now:" "selected-plan records implement_now"
	check_regex "selected-plan.md" "planned_together:" "selected-plan records planned_together bundle context"
	check_regex "selected-plan.md" "shared_seam:" "selected-plan records shared_seam bundle context"
}

check_implementation_spec_contract() {
	check_heading_once "implementation-spec.md" "# Implementation Spec" "implementation-spec has title"
	check_heading_once "implementation-spec.md" "## Spec Metadata" "implementation-spec has Spec Metadata"
	check_heading_once "implementation-spec.md" "## Inputs Consumed" "implementation-spec has Inputs Consumed"
	check_heading_once "implementation-spec.md" "## Step Specs" "implementation-spec has Step Specs"
	check_heading_once "implementation-spec.md" "## AC Behavior Specs" "implementation-spec has AC Behavior Specs"
	check_heading_once "implementation-spec.md" "## Spec Gaps" "implementation-spec has Spec Gaps"
	check_heading_once "implementation-spec.md" "## Evidence Map" "implementation-spec has Evidence Map"
	check_source_ids_present "implementation-spec.md" "implementation-spec"
}

check_plan_verification_contract() {
	check_heading_once "plan-verification.md" "# Plan Verification Report" "plan-verification has title"
	check_heading_once "plan-verification.md" "## Verdict" "plan-verification has Verdict"
	check_heading_once "plan-verification.md" "## Inputs Consumed" "plan-verification has Inputs Consumed"
	check_heading_once "plan-verification.md" "## Gate Checks" "plan-verification has Gate Checks"
	check_heading_once "plan-verification.md" "## Findings" "plan-verification has Findings"
	check_heading_once "plan-verification.md" "## Must Fix" "plan-verification has Must Fix"
	check_heading_once "plan-verification.md" "## Evidence Map" "plan-verification has Evidence Map"
	check_heading_once "plan-verification.md" "## Approved Implementation Handoff" "plan-verification has handoff"
}

check_spec_verification_contract() {
	check_heading_once "spec-verification.md" "# Spec Verification Report" "spec-verification has title"
	check_heading_once "spec-verification.md" "## Verdict" "spec-verification has Verdict"
	check_heading_once "spec-verification.md" "## Inputs Consumed" "spec-verification has Inputs Consumed"
	check_heading_once "spec-verification.md" "## Gate Checks" "spec-verification has Gate Checks"
	check_heading_once "spec-verification.md" "## Findings" "spec-verification has Findings"
	check_heading_once "spec-verification.md" "## Must Fix" "spec-verification has Must Fix"
	check_heading_once "spec-verification.md" "## Evidence Map" "spec-verification has Evidence Map"
	check_heading_once "spec-verification.md" "## Approved Implementation Handoff" "spec-verification has handoff"
}

check_implementer_report_contract() {
	local file="$1"
	local title="$2"
	local label="$3"
	check_heading_once "${file}" "# ${title}" "${label} has title"
	check_heading_once "${file}" "## Verdict" "${label} has Verdict"
	check_heading_once "${file}" "## Inputs Consumed" "${label} has Inputs Consumed"
	check_heading_once "${file}" "## Summary" "${label} has Summary"
	check_heading_once "${file}" "## Semantic Checks" "${label} has Semantic Checks"
	check_heading_once "${file}" "## Source Gaps" "${label} has Source Gaps"
	check_heading_once "${file}" "## Acceptance Criteria" "${label} has Acceptance Criteria"
	check_heading_once "${file}" "## Deviations From Plan" "${label} has Deviations From Plan"
	check_heading_once "${file}" "## Review Summary" "${label} has Review Summary"
	check_heading_once "${file}" "## Evidence Map" "${label} has Evidence Map"
}

check_integration_report_contract() {
	check_heading_once "integration-report.md" "# Integration Report" "integration-report has title"
	check_heading_once "integration-report.md" "## Verdict" "integration-report has Verdict"
	check_heading_once "integration-report.md" "## Inputs Consumed" "integration-report has Inputs Consumed"
	check_heading_once "integration-report.md" "## Commands Run" "integration-report has Commands Run"
	check_heading_once "integration-report.md" "## Environment" "integration-report has Environment"
	check_heading_once "integration-report.md" "## Check Results" "integration-report has Check Results"
	check_heading_once "integration-report.md" "## Failures" "integration-report has Failures"
	check_heading_once "integration-report.md" "## Next Action" "integration-report has Next Action"
	check_heading_once "integration-report.md" "## Evidence Map" "integration-report has Evidence Map"
}

check_review_report_contract() {
	local file="$1"
	local label="$2"
	check_heading_once "${file}" "# Review Report" "${label} has title"
	check_heading_once "${file}" "## Verdict" "${label} has Verdict"
	check_heading_once "${file}" "## Inputs Consumed" "${label} has Inputs Consumed"
	check_heading_once "${file}" "## Findings" "${label} has Findings"
	check_heading_once "${file}" "## Suggestions" "${label} has Suggestions"
	check_heading_once "${file}" "## Integrity Checks" "${label} has Integrity Checks"
	check_heading_once "${file}" "## DA Adherence" "${label} has DA Adherence"
	check_heading_once "${file}" "## Root-Cause Classification" "${label} has Root-Cause Classification"
	check_heading_once "${file}" "## Evidence Map" "${label} has Evidence Map"
}

check_compliance_report_contract() {
	check_heading_once "compliance-report.md" "# Compliance Report" "compliance-report has title"
	check_heading_once "compliance-report.md" "## Verdict" "compliance-report has Verdict"
	check_heading_once "compliance-report.md" "## Inputs Consumed" "compliance-report has Inputs Consumed"
	check_heading_once "compliance-report.md" "## Script Checks" "compliance-report has Script Checks"
	check_heading_once "compliance-report.md" "## Substance Checks" "compliance-report has Substance Checks"
	check_heading_once "compliance-report.md" "## Workflow Compliance Checklist" "compliance-report has workflow checklist"
	check_heading_once "compliance-report.md" "## Findings" "compliance-report has Findings"
	check_heading_once "compliance-report.md" "## Escalation" "compliance-report has Escalation"
	check_heading_once "compliance-report.md" "## Evidence Map" "compliance-report has Evidence Map"
}

check_working_group_findings_contract() {
	check_heading_once "working-group-findings.md" "# Working Group Findings" "working-group-findings has title"
	check_regex "working-group-findings.md" "^##[[:space:]]+.+ — .+ — .+$" "working-group-findings has entry header or is empty"
}

check_planning_source_audit_contract() {
	check_heading_once "planning-source-audit.md" "# Planning Source Audit" "planning-source-audit has title"
	check_regex "planning-source-audit.md" "^##[[:space:]]+problem-analyst — INTAKE$|^##[[:space:]]+problem-analyst — PROBLEM FRAMING$|^##[[:space:]]+problem-analyst — REQUIREMENT SHAPING$|^##[[:space:]]+solution-architect — REQUIREMENT SHAPING$|^##[[:space:]]+solution-architect — OPTION GENERATION$|^##[[:space:]]+solution-architect — DESIGN CONSOLIDATION$|^##[[:space:]]+critic — CHALLENGE REVIEW$" "planning-source-audit has planning phase entry headers"
	check_source_ids_present "planning-source-audit.md" "planning-source-audit"
}

check_workflow_state_contract() {
	check_heading_once "workflow-state.md" "# Workflow State" "workflow-state has title"
	check_regex "workflow-state.md" "^## STEP " "workflow-state has step blocks"
	check_regex "workflow-state.md" "^status:" "workflow-state has status fields"
	check_regex "workflow-state.md" "^verdict:" "workflow-state has verdict fields"
	check_regex "workflow-state.md" "^runtime_wrapper:" "workflow-state has runtime_wrapper fields"
	check_regex "workflow-state.md" "^runtime_wrapper:[[:space:]]*(explore|generalPurpose|shell|orchestrator)$" "workflow-state runtime_wrapper values are canonical"
	check_regex "workflow-state.md" "^artifact:" "workflow-state has artifact fields"
}

check_workflow_state_completion_consistency() {
	local file="${TASK_DIR}/workflow-state.md"
	if [[ ! -f "${file}" ]]; then
		fail "workflow-state completion consistency (file missing)"
		return
	fi

	local bad
	bad="$(
		awk '
			function flush_block() {
				if (in_step && status == "completed" && verdict ~ /^(FAIL|NEEDS_REVISION|FAILED|NEEDS_REPLANNING)$/) {
					bad = 1
				}
			}
			BEGIN {
				in_step = 0
				status = ""
				verdict = ""
				bad = 0
			}
			/^## STEP / {
				flush_block()
				in_step = 1
				status = ""
				verdict = ""
				next
			}
			/^status:/ {
				status = $2
				next
			}
			/^verdict:/ {
				verdict = $2
				next
			}
			END {
				flush_block()
				print bad
			}
		' "${file}"
	)"

	if [[ "${bad}" == "0" ]]; then
		pass "workflow-state does not mark failed gates completed"
	else
		fail "workflow-state does not mark failed gates completed"
	fi
}

check_planning_quality() {
	check_regex "planning-context.md" "critic_verdict:[[:space:]]*APPROVED" "planning-context critic verdict is APPROVED"
	check_regex "selected-plan.md" "satisfied_by:" "selected-plan architecture watch links constraints to design decisions"
	check_regex "selected-plan.md" "(id:[[:space:]]*DA|axis:[[:space:]]*DA)" "selected-plan includes design-axis identifiers"
	check_regex "selected-plan.md" "rejected:" "selected-plan includes rejected alternatives"
}

check_verdicts() {
	check_regex "planning-context.md" "critic_verdict:[[:space:]]*APPROVED" "planning-context critic verdict is APPROVED"
	check_regex "plan-verification.md" "value:[[:space:]]*PASS" "plan-verification verdict is PASS"
	check_regex "spec-verification.md" "value:[[:space:]]*PASS" "spec-verification verdict is PASS"
	check_regex "integration-report.md" "value:[[:space:]]*PASS" "integration-report verdict is PASS"
	check_regex "review-a.md" "value:[[:space:]]*APPROVED" "review-a verdict is APPROVED"
	check_regex "review-b.md" "value:[[:space:]]*APPROVED" "review-b verdict is APPROVED"
	check_workflow_state_completion_consistency
}

check_replan_artifacts() {
	local has_replan
	has_replan="$(
		${RG} -n -e "NEEDS_REPLANNING" \
			"${TASK_DIR}/implementer-test.md" \
			"${TASK_DIR}/implementer-core.md" \
			"${TASK_DIR}/implementer-integration.md" \
			"${TASK_DIR}/review-a.md" \
			"${TASK_DIR}/review-b.md" \
			>/dev/null 2>&1 && echo yes || echo no
	)"

	if [[ "${has_replan}" == "no" ]]; then
		pass "replan artifact not required"
		return
	fi

	if [[ -s "${TASK_DIR}/replan-request.md" ]]; then
		pass "replan-request artifact present"
	else
		fail "NEEDS_REPLANNING detected but replan-request artifact missing"
	fi

	check_regex "context-product.md" "replan-request\\.md|TASK-|source_id:" "context-product preserves replan evidence or source anchors"
	check_regex "context-tech.md" "replan-request\\.md|ADR-|source_id:" "context-tech preserves replan evidence or source anchors"
}

if [[ "${POST_MODE}" == true ]]; then
	begin_category "Post-compliance"
	check_file_nonempty "compliance-report.md"
	check_regex "compliance-report.md" "value:[[:space:]]*PASS" "compliance-report verdict is PASS"
else
	begin_category "Artifact existence"
	check_file_nonempty "issue.md"
	check_file_nonempty "context-product.md"
	check_file_nonempty "context-tech.md"
	check_file_nonempty "planning-context.md"
	check_file_nonempty "selected-plan.md"
	check_file_nonempty "implementation-spec.md"
	check_file_nonempty "plan-verification.md"
	check_file_nonempty "spec-verification.md"
	check_file_nonempty "implementer-test.md"
	check_file_nonempty "implementer-core.md"
	check_file_nonempty "implementer-integration.md"
	check_file_nonempty "integration-report.md"
	check_file_nonempty "review-a.md"
	check_file_nonempty "review-b.md"
	check_file_nonempty "compliance-report.md"
	check_file_nonempty "run-log.md"
	check_file_nonempty "workflow-state.md"
	check_file_exists "working-group-findings.md"
	check_file_exists "planning-source-audit.md"

	begin_category "Legacy cleanup"
	check_file_absent "implementer-e2e.md"
	check_file_absent "e2e-report.md"
	check_no_regex "run-log.md" "implementer-e2e|docker-e2e-runner" "run-log contains no legacy e2e step names"

	begin_category "Verdict checks"
	check_verdicts

	begin_category "Traceability"
	check_traceability_sections "selected-plan.md" "selected-plan"
	check_traceability_sections "implementation-spec.md" "implementation-spec"
	check_traceability_sections "plan-verification.md" "plan-verification"
	check_traceability_sections "spec-verification.md" "spec-verification"
	check_traceability_sections "implementer-test.md" "implementer-test"
	check_traceability_sections "implementer-core.md" "implementer-core"
	check_traceability_sections "implementer-integration.md" "implementer-integration"
	check_traceability_sections "integration-report.md" "integration-report"
	check_traceability_sections "review-a.md" "review-a"
	check_traceability_sections "review-b.md" "review-b"
	check_traceability_sections "compliance-report.md" "compliance-report"

	begin_category "Source traceability"
	check_source_ids_present "context-product.md" "context-product"
	check_source_ids_present "context-tech.md" "context-tech"
	check_source_ids_present "planning-context.md" "planning-context"
	check_source_ids_present "selected-plan.md" "selected-plan"
	check_source_ids_present "implementation-spec.md" "implementation-spec"

	begin_category "Planning quality"
	check_planning_quality

	begin_category "Artifact format"
	check_issue_packet_contract
	check_product_context_contract
	check_tech_context_contract
	check_planning_context_contract
	check_selected_plan_contract
	check_implementation_spec_contract
	check_plan_verification_contract
	check_spec_verification_contract
	check_implementer_report_contract "implementer-test.md" "Implementer Test Report" "implementer-test"
	check_implementer_report_contract "implementer-core.md" "Implementer Core Report" "implementer-core"
	check_implementer_report_contract "implementer-integration.md" "Implementer Integration Report" "implementer-integration"
	check_integration_report_contract
	check_review_report_contract "review-a.md" "review-a"
	check_review_report_contract "review-b.md" "review-b"
	check_compliance_report_contract
	check_planning_source_audit_contract
	check_workflow_state_contract

	begin_category "Step ordering"
	check_step_order
	check_replan_artifacts
fi

if [[ "${JSON_MODE}" == true ]]; then
	emit_json
else
	if (( FAILURES > 0 )); then
		echo "RESULT: FAIL (${FAILURES} checks failed)"
	else
		echo "RESULT: PASS"
	fi
fi

exit $(( FAILURES > 0 ? 1 : 0 ))

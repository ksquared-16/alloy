import { describe, expect, it } from "vitest";
import {
    formatQueueFilterEvaluationCompareReport,
    type QueueFilterEvaluationCompare,
} from "@/lib/lifecycle/lifecycleQueueFilterEvaluationCompare";
import { summarizeBuilderOwnedQueueFilterValidation } from "@/lib/lifecycle/lifecycleWorkUnitQueueValidation";
import { buildLifecycleActivationCompactChecks } from "@/lib/lifecycle/lifecycleActivationValidationCompact";

describe("lifecycleQueueFilterEvaluationCompare", () => {
    it("documents card vs runtime expected-key source strings", () => {
        const card = "queueFilterKeysFromAssignedStatusKeys";
        const runtime = "expectedStatusKeysForLifecycleStageValidation";
        expect(card).not.toBe(runtime);
    });

    it("compact fail can occur when another stage fails while focus stage passes", () => {
        const rows = [
            {
                stage_key: "enrolling",
                work_unit_id: "wu-e",
                work_unit_key: "lifecycle_wu_enrolling",
                work_unit_name: "Enrolling",
                expected_status_keys: ["deposit_paid"],
                queue_status_keys: ["deposit_paid"],
                pass: true,
                detail: "ok enrolling",
            },
            {
                stage_key: "lead",
                work_unit_id: "wu-l",
                work_unit_key: "lifecycle_wu_lead",
                work_unit_name: "Leads",
                expected_status_keys: ["new_inquiry"],
                queue_status_keys: [],
                pass: false,
                detail: 'Stage "lead": queue filters missing [new_inquiry].',
            },
        ];
        const summary = summarizeBuilderOwnedQueueFilterValidation(rows);
        expect(summary.pass).toBe(false);
        const compact = buildLifecycleActivationCompactChecks([
            {
                id: "work_unit_queue_filters",
                label: "x",
                pass: summary.pass,
                href: null,
                detail: summary.detail,
            },
        ]);
        expect(compact.find((c) => c.id === "queue_filters")?.pass).toBe(false);
        expect(rows.find((r) => r.stage_key === "enrolling")?.pass).toBe(true);
    });

    it("formats side-by-side report with PASS/FAIL lines", () => {
        const compare: QueueFilterEvaluationCompare = {
            department_id: "dept-1",
            org_id: "org-1",
            focus_stage_key: "enrolling",
            focus_stage_label: "Enrolling",
            sides: [
                {
                    id: "work_unit_queue_card",
                    label: "Work Unit Queue card",
                    stage_key: "enrolling",
                    stage_label: "Enrolling",
                    work_unit_id: "wu-1",
                    work_unit_key: "lifecycle_wu_enrolling",
                    work_unit_name: "Enrolling",
                    expected_status_keys: ["deposit_paid"],
                    actual_queue_filter_keys: ["deposit_paid"],
                    pass: true,
                    source: "lifecycleStageWorkUnitNeedsQueueFilterSync",
                    notes: [],
                },
                {
                    id: "runtime_validation_compact",
                    label: "Runtime validation (compact UI check)",
                    stage_key: "enrolling",
                    stage_label: "Enrolling",
                    work_unit_id: "wu-1",
                    work_unit_key: "lifecycle_wu_enrolling",
                    work_unit_name: "Enrolling",
                    expected_status_keys: ["deposit_paid"],
                    actual_queue_filter_keys: ["deposit_paid"],
                    pass: false,
                    source: "summarizeBuilderOwnedQueueFilterValidation",
                    notes: ['FAIL stage=lead: missing'],
                },
            ],
            diverges: true,
            divergence_reasons: ["UI CONTRADICTION: Work Unit Queue card shows connected/Complete but compact Runtime Validation shows Fail."],
            runtime_all_stage_rows: [],
            runtime_stages_validated: ["lead", "enrolling"],
            activation_bundle: { stage_key: "enrolling", work_unit_id: "wu-1", status_keys: ["deposit_paid"] },
            compact_check: {
                pass: false,
                summary: "Sync queue filters to the statuses selected for this stage.",
                technical_detail: 'Stage "lead": queue filters missing',
                source: "buildLifecycleActivationCompactChecks",
            },
            card_ui_state_hints: {
                work_unit_identity_state_derived: "synced",
                queue_complete_derived: true,
                status_display_labels: ["Enrolling"],
            },
        };
        const report = formatQueueFilterEvaluationCompareReport(compare);
        expect(report).toContain("Work Unit Queue card");
        expect(report).toContain("Result: PASS");
        expect(report).toContain("Result: FAIL");
        expect(report).toContain("DIVERGENCE");
        expect(report).toContain("lifecycleStageWorkUnitNeedsQueueFilterSync");
    });
});

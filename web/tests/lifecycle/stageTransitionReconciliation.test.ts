import { describe, expect, it } from "vitest";
import { detectBuilderStageTransition } from "@/lib/lifecycle/detectBuilderStageTransition";
import { filterResidualOperationalTasks } from "@/lib/lifecycle/filterResidualOperationalTasks";
import { isOperatingPlanWorkIntentTask } from "@/lib/lifecycle/isOperatingPlanWorkIntentTask";
import { LIFECYCLE_BUILDER_METADATA_KEY } from "@/lib/lifecycle/lifecycleBuilderConfig";
import { isBusinessProcessStageWorkTaskRow } from "@/lib/lifecycle/isBusinessProcessStageWorkTaskRow";
import { validateStageTransitionReconciliationPayload } from "@/lib/lifecycle/validateStageTransitionReconciliationPayload";
import type { StageTransitionReconciliationPreflight } from "@/lib/lifecycle/stageTransitionReconciliationTypes";

describe("isBusinessProcessStageWorkTaskRow", () => {
    it("identifies BP stage work by lifecycle_provenance", () => {
        expect(
            isBusinessProcessStageWorkTaskRow({
                metadata: {
                    lifecycle_provenance: "lifecycle_template",
                    lifecycle_stage_key: "qualification",
                    work_intent_key: "gather_enrollment_information",
                },
            }),
        ).toBe(true);
    });

    it("excludes carried-forward follow-up tasks", () => {
        expect(
            isBusinessProcessStageWorkTaskRow({
                metadata: {
                    lifecycle_provenance: "stage_reconciliation_carry_forward",
                    lifecycle_stage_key: "qualification",
                },
            }),
        ).toBe(false);
    });
});

describe("validateStageTransitionReconciliationPayload", () => {
    const preflight: StageTransitionReconciliationPreflight = {
        required: true,
        previous_builder_stage_key: "qualification",
        next_builder_stage_key: "enrolling",
        previous_status_key: "qualified",
        next_status_key: "registration_pending",
        next_stage_label: "Enrolling",
        open_work: [
            {
                work_id: "work-1",
                title: "Gather Enrollment Information",
                lifecycle_stage_key: "qualification",
                stage_label: "Qualification",
                template_key: "gather_enrollment_information",
                work_definition_key: "collect_missing_information",
                due_at: null,
            },
        ],
        openWorkConflicts: [
            {
                work_id: "work-1",
                title: "Gather Enrollment Information",
                lifecycle_stage_key: "qualification",
                stage_label: "Qualification",
                template_key: "gather_enrollment_information",
                work_definition_key: "collect_missing_information",
                due_at: null,
            },
        ],
        has_attention: true,
        attention_reason: "Missing qualification information",
        wait_bucket: "waiting_on_staff",
        missingRequirements: [],
        blockingRequirements: [],
        canProceed: false,
    };

    it("requires every open work item and attention resolution", () => {
        const result = validateStageTransitionReconciliationPayload(preflight, {
            work: [{ work_id: "work-1", resolution: "skipped" }],
            attention: "cleared",
        });
        expect(result.ok).toBe(true);
    });

    it("rejects incomplete work reconciliation", () => {
        const result = validateStageTransitionReconciliationPayload(preflight, {
            work: [],
            attention: "cleared",
        });
        expect(result.ok).toBe(false);
    });
});

describe("stage transition projection behavior", () => {
    it("detects builder stage change when skipping stages", () => {
        const departmentMetadata = {
            [LIFECYCLE_BUILDER_METADATA_KEY]: {
                version: 1,
                active_process_id: "proc-1",
                processes: [
                    {
                        id: "proc-1",
                        key: "enrollment",
                        name: "Enrollment",
                        primary_entity: "opportunity",
                        sort_order: 0,
                        is_active: true,
                        stages: [
                            { id: "s1", key: "lead", label: "Lead", sort_order: 0, is_active: true },
                            { id: "s2", key: "qualification", label: "Qualification", sort_order: 1, is_active: true },
                            { id: "s3", key: "enrolling", label: "Enrolling", sort_order: 2, is_active: true },
                        ],
                    },
                ],
            },
        };

        const transition = detectBuilderStageTransition({
            previousStatusKey: "new_inquiry",
            nextStatusKey: "registration_pending",
            departmentMetadata,
            previousStatusMetadata: {
                process_stage_key: "lead",
                stage_key: "lead",
            },
            nextStatusMetadata: {
                process_stage_key: "enrolling",
                stage_key: "enrolling",
            },
        });

        expect(transition.stageChanged).toBe(true);
        expect(transition.previousBuilderStageKey).toBe("lead");
        expect(transition.nextBuilderStageKey).toBe("enrolling");
    });

    it("shows carried-forward prior-stage work in follow-ups, not current work", () => {
        const carriedForwardTask = {
            id: "work-prior",
            title: "Gather Enrollment Information",
            due_at: "",
            status: "open",
            source: "lifecycle_stage_work",
            work_intent_key: "gather_enrollment_information",
            operating_plan_template_key: "gather_enrollment_information",
            lifecycle_stage_key: "qualification",
            lifecycle_provenance: "stage_reconciliation_carry_forward",
        };

        expect(
            isOperatingPlanWorkIntentTask(carriedForwardTask, "enrolling", ["send_enrollment_packet"]),
        ).toBe(false);

        const filtered = filterResidualOperationalTasks(
            {
                state: "loaded",
                open_tasks: [carriedForwardTask],
                open_count: 1,
            },
            {
                stage_key: "enrolling",
                template_keys: ["send_enrollment_packet"],
                primary: {
                    template_key: "send_enrollment_packet",
                    work_id: "work-current",
                },
                additional: [],
            } as never,
        );

        expect(filtered.open_tasks).toHaveLength(1);
        expect(filtered.open_tasks[0]?.id).toBe("work-prior");
    });
});

import { describe, expect, it } from "vitest";

import { buildCurrentWorkSurfaceVM } from "@/lib/adminV2/runtime/focusPanel/currentWork/buildCurrentWorkSurfaceVM";
import { resolveCurrentWorkTemplateFromPublishedPlan } from "@/lib/adminV2/runtime/focusPanel/currentWork/resolveCurrentWorkTemplateFromPublishedPlan";
import { resolveTransitionRefToHandlerKey } from "@/lib/lifecycle/resolveWorkTemplateTransitionHandler";
import type { OperationalContext, OperationalContextSignals } from "@/lib/adminV2/runtime/operationalContext/types";
import type { StageWorkRuntimeProjection } from "@/lib/lifecycle/stageWorkRuntimeTypes";
import {
    billingCollectPaymentPublishedDepartmentMetadata,
    enrollmentLeadPublishedDepartmentMetadata,
    applyEnrollmentLeadWorkTemplateActions,
} from "./fixtures/currentWorkPublishedPlanFixtures";
import { resolvePublishedStageInputsForCurrentWork } from "@/lib/adminV2/runtime/focusPanel/currentWork/resolvePublishedStageInputsForCurrentWork";
import { defaultStageOperatingPlanForEnrollmentStage } from "@/lib/lifecycle/defaultEnrollmentStageOperatingPlans";
import { stageOperatingPlanDraftToPersisted } from "@/lib/lifecycle/stageOperatingPlanEditorModel";

const NULL_SIGNALS: OperationalContextSignals = {
    work: { primary: null, items: [], openCount: 0, overdueCount: 0, nextActionLabel: null },
    attention: { needsAttention: false, primaryReason: null, reasonCount: 0 },
    tour: { scheduled: false, startAt: null, statusLabel: null, statusKey: null, bookingId: null },
    communications: { scheduledSendCount: 0, nextFollowUpAt: null, hasOutreach: false, nextScheduledSendId: null },
    billing: { billingConfigured: false, billingContactName: null, billingContactEmail: null, tuitionRateLabel: null, feeBalanceCents: null },
};

function baseContext(partial: Partial<OperationalContext>): OperationalContext {
    return {
        grain: "case",
        subject: { type: "opportunity", id: "opp-1", label: "Test Family" },
        businessProcess: { key: "enrollment", label: "Enrollment", stageKey: "lead" },
        perspective: null,
        truth: {},
        signals: NULL_SIGNALS,
        capabilities: { canMutate: true, maskedChannels: false },
        status: "ready",
        ...partial,
    };
}

function enrollmentContactRuntime(): StageWorkRuntimeProjection {
    const defaults = applyEnrollmentLeadWorkTemplateActions(defaultStageOperatingPlanForEnrollmentStage("lead")!);
    const contactTemplate = defaults.work_templates.find((t) => t.template_key === "contact_family")!;
    const plan = stageOperatingPlanDraftToPersisted(
        {
            purpose: defaults.purpose ?? "",
            journey_segment: defaults.journey_segment,
            work_templates: [{ ...contactTemplate, primary: true }],
            outcomes: defaults.outcomes,
            outcome_rules: defaults.outcome_rules,
            attention_rules: defaults.attention_rules,
        },
        "lead",
    )!;
    return {
        stage_key: "lead",
        stage_label: "Lead",
        purpose: plan.purpose ?? "",
        journey_segment: plan.journey_segment,
        template_keys: ["contact_family"],
        primary: {
            template_key: "contact_family",
            label: "Contact Family",
            role: "primary",
            state: "open",
            requires_outcome_picker: true,
            work_id: "work-contact",
            due_at: null,
            due_urgency: "none",
            attempt_count: 0,
            last_outcome: null,
            completed_at: null,
            outcomes: plan.outcomes,
            completion_policy_summary: null,
            completion_policy_min_attempts: null,
            completion_policy_max_attempts: null,
            outcome_automation_preview: [],
        },
        additional: [],
        execution: {
            department_id: "dept-1",
            subject: { journey_segment: "family", opportunity_id: "opp-1" },
            requires_outcome_picker: true,
        },
    };
}

describe("Work Template Current Work runtime", () => {
    it("renders explicit helpful actions in configured order without catalog fallback append", () => {
        const publishedStageInputs = resolvePublishedStageInputsForCurrentWork({
            departmentMetadata: enrollmentLeadPublishedDepartmentMetadata(),
            builderStageKey: "lead",
        })!;
        const vm = buildCurrentWorkSurfaceVM({
            context: baseContext({
                stageWorkRuntime: enrollmentContactRuntime(),
                publishedStageInputs,
            }),
        });

        expect(vm.supportingActions.map((a) => a.key)).toEqual([
            "schedule_tour",
            "quick_message",
            "add_child",
            "send_form",
        ]);
        expect(vm.supportingActions.map((a) => a.key)).not.toContain("close_lead");
    });

    it("explicit empty helpful actions produce no helpful actions", () => {
        const publishedStageInputs = resolvePublishedStageInputsForCurrentWork({
            departmentMetadata: enrollmentLeadPublishedDepartmentMetadata(),
            builderStageKey: "lead",
        })!;
        publishedStageInputs.operatingPlan.work_templates = publishedStageInputs.operatingPlan.work_templates.map((t) =>
            t.template_key === "contact_family" ? { ...t, helpful_actions: [] } : t,
        );
        const vm = buildCurrentWorkSurfaceVM({
            context: baseContext({
                stageWorkRuntime: enrollmentContactRuntime(),
                publishedStageInputs,
                recordHeaderActions: {
                    primary: [],
                    secondary: [{ key: "schedule_tour", label: "Schedule Tour", description: null, action_type: "registry", icon: null, style: null, display_style: "outline", payload: {}, workflow_id: null }],
                    overflow: [],
                    right_rail: [],
                    row_inline: [],
                    header: [],
                },
            }),
        });
        expect(vm.supportingActions).toEqual([]);
    });

    it("never surfaces generic Change Enrollment Status on Current Work", () => {
        const publishedStageInputs = resolvePublishedStageInputsForCurrentWork({
            departmentMetadata: enrollmentLeadPublishedDepartmentMetadata(),
            builderStageKey: "lead",
        })!;
        const vm = buildCurrentWorkSurfaceVM({
            context: baseContext({
                stageWorkRuntime: enrollmentContactRuntime(),
                publishedStageInputs,
                recordHeaderActions: {
                    primary: [],
                    secondary: [{ key: "update_enrollment_status", label: "Change Enrollment Status", description: null, action_type: "mutation_command", icon: null, style: null, display_style: "outline", payload: {}, workflow_id: null }],
                    overflow: [],
                    right_rail: [],
                    row_inline: [],
                    header: [],
                },
            }),
        });
        const keys = [...vm.supportingActions, ...vm.alternatePaths].map((a) => a.key);
        expect(keys).not.toContain("update_enrollment_status");
    });

    it("filters completion outcomes by template outcome refs", () => {
        const publishedStageInputs = resolvePublishedStageInputsForCurrentWork({
            departmentMetadata: enrollmentLeadPublishedDepartmentMetadata(),
            builderStageKey: "lead",
        })!;
        const vm = buildCurrentWorkSurfaceVM({
            context: baseContext({ stageWorkRuntime: enrollmentContactRuntime(), publishedStageInputs }),
        });
        expect(vm.completionOutcomes.map((o) => o.outcome_key)).toEqual([
            "reached_family",
            "left_message",
            "needs_follow_up",
            "interested",
            "not_interested",
        ]);
    });

    it("billing template uses same resolver without enrollment conditionals", () => {
        const publishedStageInputs = resolvePublishedStageInputsForCurrentWork({
            departmentMetadata: billingCollectPaymentPublishedDepartmentMetadata(),
            builderStageKey: "collect_payment",
        })!;
        const resolved = resolveCurrentWorkTemplateFromPublishedPlan({
            ...publishedStageInputs,
            stageWorkRuntime: null,
            recordHeaderActions: null,
            processStages: publishedStageInputs.processStages,
        })!;
        expect(resolved.templateConfig.primary_action?.action_ref).toBe("record_payment");
        expect(resolved.templateConfig.helpful_actions_explicit).toBe(true);
    });

    it("maps transition refs to executable handler keys via catalog metadata", () => {
        expect(
            resolveTransitionRefToHandlerKey("move_to_stage:waitlist", {
                version: 1,
                candidate_actions: [{ action_key: "close_lead", recommendation: "context_dependent" }],
            }),
        ).toBe("move_to_stage:waitlist");
        expect(
            resolveTransitionRefToHandlerKey("close_lead", {
                version: 1,
                candidate_actions: [{ action_key: "close_lead", recommendation: "context_dependent" }],
            }),
        ).toBe("close_lead");
    });

    it("two work templates in one stage can expose different outcome sets", () => {
        const defaults = applyEnrollmentLeadWorkTemplateActions(defaultStageOperatingPlanForEnrollmentStage("lead")!);
        const contactTemplate = defaults.work_templates.find((t) => t.template_key === "contact_family")!;
        const plan = stageOperatingPlanDraftToPersisted(
            {
                purpose: defaults.purpose ?? "",
                journey_segment: defaults.journey_segment,
                work_templates: [
                    {
                        template_key: "secondary_follow_up",
                        label: "Secondary Follow-up",
                        required: false,
                        primary: false,
                        due_policy: { kind: "offset_days", days: 1 },
                        owner_strategy: "record_owner",
                        work_definition_key: "contact_family",
                        outcome_refs: [{ outcome_ref: "needs_follow_up" }],
                    },
                    { ...contactTemplate, primary: true },
                ],
                outcomes: defaults.outcomes,
                outcome_rules: defaults.outcome_rules,
                attention_rules: defaults.attention_rules,
            },
            "lead",
        )!;
        const secondaryRuntime: StageWorkRuntimeProjection = {
            ...enrollmentContactRuntime(),
            primary: {
                ...enrollmentContactRuntime().primary!,
                template_key: "secondary_follow_up",
                label: "Secondary Follow-up",
                outcomes: plan.outcomes.filter((o) => o.outcome_key === "needs_follow_up"),
            },
        };
        const publishedStageInputs = resolvePublishedStageInputsForCurrentWork({
            departmentMetadata: enrollmentLeadPublishedDepartmentMetadata(),
            builderStageKey: "lead",
        })!;
        publishedStageInputs.operatingPlan = plan;
        const vm = buildCurrentWorkSurfaceVM({
            context: baseContext({ stageWorkRuntime: secondaryRuntime, publishedStageInputs }),
        });
        expect(vm.completionOutcomes.map((o) => o.outcome_key)).toEqual(["needs_follow_up"]);
    });
});

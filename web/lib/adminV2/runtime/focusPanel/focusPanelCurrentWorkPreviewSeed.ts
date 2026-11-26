/**
 * Representative Current Work configuration for Surface Builder preview.
 * Uses the same published-plan + stage-runtime path as production runtime.
 */

import type { ResolvedActionsBySlot } from "@/lib/admin/actions/types";
import type { PublishedStageInputsForCurrentWork } from "@/lib/adminV2/runtime/focusPanel/currentWork/resolvePublishedStageInputsForCurrentWork";
import { resolvePublishedStageInputsForCurrentWork } from "@/lib/adminV2/runtime/focusPanel/currentWork/resolvePublishedStageInputsForCurrentWork";
import type { OpportunityDrawerViewModel } from "@/lib/adminV2/viewModel/drawer/types";
import { buildStageWorkOutcomeAutomationPreview } from "@/lib/lifecycle/buildStageWorkOutcomeAutomationPreview";
import { defaultStageOperatingPlanForEnrollmentStage } from "@/lib/lifecycle/defaultEnrollmentStageOperatingPlans";
import { LIFECYCLE_BUILDER_METADATA_KEY } from "@/lib/lifecycle/lifecycleBuilderConfig";
import { LIFECYCLE_BUILDER_STAGE_FIELD_RULES_METADATA_KEY } from "@/lib/lifecycle/lifecycleBuilderStageFieldRules";
import type { StageActionCatalogV1 } from "@/lib/lifecycle/stageActionCatalogV1";
import type { StageOperatingPlanV1 } from "@/lib/lifecycle/stageOperatingPlanV1";
import { stageOperatingPlanDraftToPersisted } from "@/lib/lifecycle/stageOperatingPlanEditorModel";
import type { StageWorkRuntimeProjection } from "@/lib/lifecycle/stageWorkRuntimeTypes";

function representativeActionCatalog(): StageActionCatalogV1 {
    return {
        version: 1,
        candidate_actions: [
            { action_key: "schedule_tour", recommendation: "recommended" },
            { action_key: "quick_message", recommendation: "ready" },
            { action_key: "close_lead", recommendation: "context_dependent" },
            { action_key: "update_enrollment_status", recommendation: "context_dependent" },
        ],
    };
}

function representativeDepartmentMetadata(): Record<string, unknown> {
    const operatingPlan = defaultStageOperatingPlanForEnrollmentStage("lead")!;
    return {
        [LIFECYCLE_BUILDER_METADATA_KEY]: {
            version: 1,
            active_process_id: "proc-enrollment",
            processes: [
                {
                    id: "proc-enrollment",
                    key: "enrollment",
                    name: "Enrollment",
                    primary_entity: "opportunity",
                    sort_order: 0,
                    is_active: true,
                    stages: [
                        {
                            id: "stage-lead",
                            key: "lead",
                            label: "Lead",
                            sort_order: 0,
                            is_active: true,
                            stage_operating_plan_v1: operatingPlan,
                            action_catalog_v1: representativeActionCatalog(),
                        },
                    ],
                },
            ],
        },
        [LIFECYCLE_BUILDER_STAGE_FIELD_RULES_METADATA_KEY]: {
            version: 1,
            by_stage_key: {
                lead: {
                    required_rule_ids: [
                        "child:first_name",
                        "child:program_interest",
                        "custom:opportunity:schools",
                    ],
                    recommended_rule_ids: ["person:email"],
                },
            },
        },
    };
}

export function buildRepresentativeStageWorkRuntime(): StageWorkRuntimeProjection {
    const defaults = defaultStageOperatingPlanForEnrollmentStage("lead")!;
    const contactTemplate = defaults.work_templates.find((t) => t.template_key === "contact_family")!;
    const plan = stageOperatingPlanDraftToPersisted(
        {
            purpose: defaults.purpose ?? "",
            journey_segment: defaults.journey_segment,
            work_templates: [{ ...contactTemplate, primary: true }],
            outcomes: defaults.outcomes.filter((o) => o.work_template_key === "contact_family"),
            outcome_rules: defaults.outcome_rules,
            attention_rules: defaults.attention_rules,
        },
        "lead",
    ) as StageOperatingPlanV1;

    return {
        stage_key: "lead",
        stage_label: "Lead",
        purpose: plan.purpose ?? "Review inbound lead and reach the family.",
        journey_segment: plan.journey_segment,
        template_keys: ["contact_family"],
        primary: {
            template_key: "contact_family",
            label: "Contact Family",
            description: "Make contact and record outcome.",
            role: "primary",
            state: "open",
            requires_outcome_picker: true,
            work_id: "demo-work-contact",
            due_at: new Date().toISOString(),
            due_urgency: "due_today",
            attempt_count: 0,
            last_outcome: null,
            completed_at: null,
            outcomes: plan.outcomes,
            completion_policy_summary: null,
            completion_policy_min_attempts: null,
            completion_policy_max_attempts: null,
            outcome_automation_preview: buildStageWorkOutcomeAutomationPreview({
                plan,
                templateKey: "contact_family",
            }),
        },
        additional: [],
        execution: {
            department_id: "demo-dept-1",
            subject: { journey_segment: "family", opportunity_id: "demo-opp-1" },
            requires_outcome_picker: true,
        },
    };
}

export function buildRepresentativePublishedStageInputs(): PublishedStageInputsForCurrentWork {
    return resolvePublishedStageInputsForCurrentWork({
        departmentMetadata: representativeDepartmentMetadata(),
        builderStageKey: "lead",
    })!;
}

export function buildRepresentativeRecordHeaderActions(): ResolvedActionsBySlot {
    return {
        primary: [],
        secondary: [
            {
                key: "update_enrollment_status",
                label: "Change Enrollment Status",
                description: null,
                action_type: "registry",
                icon: null,
                style: null,
                display_style: "outline",
                payload: {},
                workflow_id: null,
            },
            {
                key: "close_lead",
                label: "Close lead",
                description: null,
                action_type: "registry",
                icon: null,
                style: null,
                display_style: "outline",
                payload: {},
                workflow_id: null,
            },
        ],
        header: [],
        overflow: [],
        right_rail: [],
        row_inline: [],
    };
}

/** Enrich the Surface Builder demo VM so Current Work uses the production pipeline. */
export function enrichDemoViewModelForCurrentWorkPreview(vm: OpportunityDrawerViewModel): void {
    vm.workspace.stage_work_runtime = buildRepresentativeStageWorkRuntime();
    vm.workspace.published_stage_inputs = buildRepresentativePublishedStageInputs();
    vm.workspace.stage_context = {
        stage_key: "lead",
        stage_label: "Lead",
        purpose: "Review inbound lead and reach the family.",
    };
    vm.workspace.lifecycle_rail = {
        current_stage_key: "lead",
        stages: [{ key: "lead", label: "Lead" }],
    };
    vm.actions.record_header = buildRepresentativeRecordHeaderActions();
}

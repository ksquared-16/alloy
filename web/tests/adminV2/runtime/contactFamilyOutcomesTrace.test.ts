/**
 * Contact Family outcome data-path trace — proves where outcomes disappear.
 *
 * Run: npm run test -- tests/adminV2/runtime/contactFamilyOutcomesTrace.test.ts
 */

import { describe, expect, it } from "vitest";

import { buildOperationalContext } from "@/lib/adminV2/runtime/operationalContext/buildOperationalContext";
import { projectCurrentWork } from "@/lib/adminV2/runtime/focusPanel/currentWork/projectCurrentWork";
import { defaultStageOperatingPlanForEnrollmentStage } from "@/lib/lifecycle/defaultEnrollmentStageOperatingPlans";
import { LIFECYCLE_BUILDER_METADATA_KEY } from "@/lib/lifecycle/lifecycleBuilderConfig";
import { projectStageWorkRuntimeSync } from "@/lib/lifecycle/projectStageWorkRuntime";
import { resolveEffectiveStageOperatingPlan } from "@/lib/lifecycle/resolveEffectiveStageOperatingPlan";
import { completionOutcomesForPicker } from "@/lib/workIntent/stageWorkOutcomeEffectLines";
import { stageOperatingPlanDraftToPersisted } from "@/lib/lifecycle/stageOperatingPlanEditorModel";
import type { StageOperatingPlanV1 } from "@/lib/lifecycle/stageOperatingPlanV1";
import type { OperationalContext } from "@/lib/adminV2/runtime/operationalContext/types";
import type { OpportunityDrawerViewModel } from "@/lib/adminV2/viewModel/drawer/types";

const CONTACT_OUTCOME_KEYS = [
    "reached_qualified",
    "left_message",
    "awaiting_response",
    "unable_to_reach",
    "contact_closed_lost",
] as const;

function enrollmentMetadataWithExplicitPlan(plan: StageOperatingPlanV1): Record<string, unknown> {
    return {
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
                        {
                            id: "s1",
                            key: "lead",
                            label: "Lead",
                            sort_order: 0,
                            is_active: true,
                            stage_operating_plan_v1: plan,
                        },
                    ],
                },
            ],
        },
    };
}

/** Lead plan with Review Lead removed — Contact Family is primary (user-edited process). */
function leadPlanContactFamilyOnly(): StageOperatingPlanV1 {
    const defaults = defaultStageOperatingPlanForEnrollmentStage("lead")!;
    const contactTemplate = defaults.work_templates.find((t) => t.template_key === "contact_family")!;
    const qualifyTemplate = defaults.work_templates.find((t) => t.template_key === "qualify_fit")!;
    return stageOperatingPlanDraftToPersisted(
        {
            purpose: defaults.purpose ?? "",
            journey_segment: defaults.journey_segment,
            work_templates: [
                { ...contactTemplate, primary: true },
                qualifyTemplate,
            ],
            outcomes: defaults.outcomes.filter(
                (o) =>
                    o.work_template_key === "contact_family"
                    || o.work_template_key === "qualify_fit",
            ),
            outcome_rules: defaults.outcome_rules,
            attention_rules: defaults.attention_rules,
        },
        "lead",
    )!;
}

function openContactFamilyRow(id = "work-contact") {
    return {
        id,
        title: "Contact Family",
        due_at: new Date().toISOString(),
        status: "open",
        source: "manual",
        metadata: {
            work_intent_key: "contact_family",
            operating_plan_template_key: "contact_family",
            lifecycle_stage_key: "lead",
            lifecycle_provenance: "lifecycle_template",
        },
        updated_at: new Date().toISOString(),
    };
}

function minimalDrawerVm(stageWorkRuntime: NonNullable<OpportunityDrawerViewModel["workspace"]["stage_work_runtime"]>): OpportunityDrawerViewModel {
    return {
        generation: "test",
        structureSettled: true,
        compose_version: 1,
        entity: { type: "opportunity", id: "opp-1" },
        workspace: {
            department_id: "dept-1",
            work_unit_id: "wu-1",
            queue_definition: null,
            lifecycle_rail: {
                current_stage_key: "lead",
                stages: [{ key: "lead", label: "Lead" }],
            },
            stage_context: { stage_key: "lead", stage_label: "Lead", purpose: null },
            work_intent_runtime: null,
            stage_work_runtime: stageWorkRuntime,
        },
        first_paint: { sections: [] },
        header: {
            title: "Test",
            subtitle: null,
            status: { key: "open", label: "Open", can_mutate: true },
            oper_trust_preview: null,
        },
        layout: {
            shell: { layout_version: "v1", layout_config_snapshot: {} },
            tabs: [],
            default_tab: "overview",
        },
        actions: { header: [], header_menu: [], primary: [], secondary: [], overflow: [], right_rail: [], row_inline: [] },
        summaries: {
            tasks: { state: "loaded", open_count: 0, open_tasks: [] },
            attention: { needs_attention: false, primary_reason: null, reason_count: 0 },
            reminders: { scheduled_send_count: 0, next_follow_up_iso: null, scheduled_sends: [] },
            active_tour_bookings: [],
        },
        above_fold: { record: { id: "opp-1" }, sections: [] },
        timing: { phases_ms: {} },
    } as unknown as OpportunityDrawerViewModel;
}

function contextFromRuntime(
    stageWorkRuntime: NonNullable<OpportunityDrawerViewModel["workspace"]["stage_work_runtime"]>,
): OperationalContext {
    const vm = minimalDrawerVm(stageWorkRuntime);
    return buildOperationalContext({
        subjectId: "opp-1",
        title: "Digan Family",
        subjectVm: vm,
        truth: { id: "opp-1" },
        perspective: null,
        statusLabel: "Lead",
        canMutate: true,
    });
}

describe("Contact Family outcomes — data path trace", () => {
    it("1. Lead operating plan has contact_family outcomes in config", () => {
        const plan = leadPlanContactFamilyOnly();
        const contactOutcomes = plan.outcomes.filter((o) => o.work_template_key === "contact_family");
        expect(contactOutcomes.map((o) => o.outcome_key).sort()).toEqual([...CONTACT_OUTCOME_KEYS].sort());
    });

    it("2–3. projectStageWorkRuntime attaches outcomes to open Contact Family item", () => {
        const plan = leadPlanContactFamilyOnly();
        const metadata = enrollmentMetadataWithExplicitPlan(plan);
        const { plan: resolvedPlan, source } = resolveEffectiveStageOperatingPlan({
            departmentMetadata: metadata,
            builderStageKey: "lead",
        });
        expect(source).toBe("explicit");

        const runtime = projectStageWorkRuntimeSync({
            orgId: "org-1",
            opportunityId: "opp-1",
            departmentId: "dept-1",
            departmentMetadata: metadata,
            builderStageKey: "lead",
            openRows: [openContactFamilyRow()],
            completedRows: [],
        });

        const openItem =
            runtime?.primary?.template_key === "contact_family" && runtime.primary.state === "open"
                ? runtime.primary
                : runtime?.additional.find((i) => i.template_key === "contact_family" && i.state === "open");

        expect(openItem).toBeTruthy();
        expect(openItem!.outcomes.map((o) => o.outcome_key).sort()).toEqual([...CONTACT_OUTCOME_KEYS].sort());
        expect(openItem!.requires_outcome_picker).toBe(true);
        expect(resolvedPlan?.outcomes.filter((o) => o.work_template_key === "contact_family").length).toBe(5);
    });

    it("4–6. projectCurrentWork forwards outcomes when Contact Family is open", () => {
        const plan = leadPlanContactFamilyOnly();
        const metadata = enrollmentMetadataWithExplicitPlan(plan);
        const runtime = projectStageWorkRuntimeSync({
            orgId: "org-1",
            opportunityId: "opp-1",
            departmentId: "dept-1",
            departmentMetadata: metadata,
            builderStageKey: "lead",
            openRows: [openContactFamilyRow()],
            completedRows: [],
        })!;

        const ctx = contextFromRuntime(runtime);
        expect(ctx.stageWorkRuntime?.primary?.outcomes.length ?? ctx.stageWorkRuntime?.additional[0]?.outcomes.length).toBeGreaterThan(0);

        const vm = projectCurrentWork(ctx);
        expect(vm.title).toBe("Contact Family");
        expect(completionOutcomesForPicker(vm.primaryWorkItem!).map((o) => o.outcome_key).sort()).toEqual(
            [...CONTACT_OUTCOME_KEYS].sort(),
        );
        expect(vm.completionOutcomes.map((o) => o.outcome_key).sort()).toEqual([...CONTACT_OUTCOME_KEYS].sort());
        expect(vm.showOutcomeCompletion).toBe(true);
    });

    it("planned Contact Family without open task — no completion until work is spawned", () => {
        const plan = leadPlanContactFamilyOnly();
        const metadata = enrollmentMetadataWithExplicitPlan(plan);
        const runtime = projectStageWorkRuntimeSync({
            orgId: "org-1",
            opportunityId: "opp-1",
            departmentId: "dept-1",
            departmentMetadata: metadata,
            builderStageKey: "lead",
            openRows: [],
            completedRows: [],
        })!;

        const contactItem =
            runtime.primary?.template_key === "contact_family"
                ? runtime.primary
                : runtime.additional.find((i) => i.template_key === "contact_family");

        expect(contactItem?.state).toBe("planned");
        expect(contactItem!.outcomes.map((o) => o.outcome_key).sort()).toEqual([...CONTACT_OUTCOME_KEYS].sort());

        const vm = projectCurrentWork(contextFromRuntime(runtime));
        expect(vm.title).toBe("Contact Family");
        expect(vm.showOutcomeCompletion).toBe(false);
    });

    it("legacy make_contact open task binds to contact_family template with configured outcomes", () => {
        const plan = leadPlanContactFamilyOnly();
        const metadata = enrollmentMetadataWithExplicitPlan(plan);
        const runtime = projectStageWorkRuntimeSync({
            orgId: "org-1",
            opportunityId: "opp-1",
            departmentId: "dept-1",
            departmentMetadata: metadata,
            builderStageKey: "lead",
            openRows: [
                {
                    id: "legacy-task",
                    title: "Contact Family",
                    due_at: new Date().toISOString(),
                    status: "open",
                    source: "manual",
                    metadata: {
                        work_intent_key: "make_contact",
                        lifecycle_stage_key: "lead",
                    },
                    updated_at: new Date().toISOString(),
                },
            ],
            completedRows: [],
        })!;

        const contactItem =
            runtime.primary?.template_key === "contact_family"
                ? runtime.primary
                : runtime.additional.find((i) => i.template_key === "contact_family");

        expect(contactItem?.state).toBe("open");
        expect(contactItem!.outcomes.map((o) => o.outcome_key).sort()).toEqual([...CONTACT_OUTCOME_KEYS].sort());

        const vm = projectCurrentWork(contextFromRuntime(runtime));
        expect(vm.title).toBe("Contact Family");
        expect(vm.completionOutcomes.map((o) => o.outcome_key).sort()).toEqual([...CONTACT_OUTCOME_KEYS].sort());
        expect(vm.showOutcomeCompletion).toBe(true);
    });
});

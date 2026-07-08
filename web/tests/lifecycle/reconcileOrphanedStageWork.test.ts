import { describe, expect, it } from "vitest";

import {
    findOrphanedOpenStageWorkTasks,
    isOrphanedStageWorkTask,
    templateKeysForStagePlan,
} from "@/lib/lifecycle/reconcileOrphanedStageWorkForOpportunity";
import { defaultStageOperatingPlanForEnrollmentStage } from "@/lib/lifecycle/defaultEnrollmentStageOperatingPlans";
import { stageOperatingPlanDraftToPersisted } from "@/lib/lifecycle/stageOperatingPlanEditorModel";

function contactFamilyOnlyPlan() {
    const defaults = defaultStageOperatingPlanForEnrollmentStage("lead")!;
    const contactTemplate = defaults.work_templates.find((t) => t.template_key === "contact_family")!;
    return stageOperatingPlanDraftToPersisted(
        {
            purpose: defaults.purpose ?? "",
            journey_segment: defaults.journey_segment,
            work_templates: [{ ...contactTemplate, primary: true }],
            outcomes: defaults.outcomes.filter((o) => o.work_template_key === "contact_family"),
            outcome_rules: defaults.outcome_rules,
            attention_rules: defaults.attention_rules,
        },
        "lead",
    )!;
}

describe("reconcileOrphanedStageWorkForOpportunity", () => {
    it("flags review_lead open task as orphan when plan only has contact_family", () => {
        const plan = contactFamilyOnlyPlan();
        const keys = templateKeysForStagePlan(plan);
        expect(keys).toEqual(["contact_family"]);

        const row = {
            id: "t1",
            title: "Review Lead",
            metadata: {
                work_intent_key: "review_lead",
                operating_plan_template_key: "review_lead",
                lifecycle_stage_key: "lead",
                lifecycle_provenance: "lifecycle_template",
            },
            source: "manual",
        };

        expect(isOrphanedStageWorkTask(row, keys, "lead")).toBe(true);
        expect(findOrphanedOpenStageWorkTasks([row], plan, "lead")).toHaveLength(1);
    });

    it("does not flag contact_family task when it is in the plan", () => {
        const plan = contactFamilyOnlyPlan();
        const keys = templateKeysForStagePlan(plan);
        const row = {
            id: "t2",
            title: "Contact Family",
            metadata: {
                work_intent_key: "contact_family",
                operating_plan_template_key: "contact_family",
                lifecycle_stage_key: "lead",
                lifecycle_provenance: "lifecycle_template",
            },
            source: "manual",
        };
        expect(isOrphanedStageWorkTask(row, keys, "lead")).toBe(false);
    });
});

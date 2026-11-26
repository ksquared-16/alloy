import { describe, expect, it } from "vitest";
import { defaultStageOperatingPlanForEnrollmentStage } from "@/lib/lifecycle/defaultEnrollmentStageOperatingPlans";
import { LIFECYCLE_BUILDER_METADATA_KEY } from "@/lib/lifecycle/lifecycleBuilderConfig";
import { resolveEffectiveStageOperatingPlan } from "@/lib/lifecycle/resolveEffectiveStageOperatingPlan";
import { projectStageWorkRuntimeSync } from "@/lib/lifecycle/projectStageWorkRuntime";
import { resolvePrimaryWorkIntentForStage } from "@/lib/lifecycle/resolvePrimaryWorkIntentForStage";

function enrollmentDepartmentMetadata(): Record<string, unknown> {
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
                        { id: "s1", key: "lead", label: "Lead", sort_order: 0, is_active: true },
                    ],
                },
            ],
        },
    };
}

describe("resolveEffectiveStageOperatingPlan", () => {
    it("returns enrollment default when stage has no explicit plan", () => {
        const result = resolveEffectiveStageOperatingPlan({
            departmentMetadata: enrollmentDepartmentMetadata(),
            builderStageKey: "lead",
        });
        expect(result.source).toBe("enrollment_default");
        expect(result.plan?.work_templates.map((t) => t.template_key)).toEqual(["contact_family"]);
    });

    it("spawn and projection resolve the same primary work intent for lead", () => {
        const departmentMetadata = enrollmentDepartmentMetadata();
        const { plan } = resolveEffectiveStageOperatingPlan({
            departmentMetadata,
            builderStageKey: "lead",
        });
        const spawnIntent = resolvePrimaryWorkIntentForStage("lead", plan);
        const runtime = projectStageWorkRuntimeSync({
            orgId: "org-1",
            opportunityId: "opp-1",
            departmentId: "dept-1",
            departmentMetadata,
            builderStageKey: "lead",
            openRows: [],
            completedRows: [],
        });

        expect(spawnIntent?.template_key).toBe("contact_family");
        expect(runtime?.primary?.template_key).toBe("contact_family");
        expect(spawnIntent?.template_key).toBe(runtime?.primary?.template_key);
    });
});

describe("projectStageWorkRuntimeSync planned state", () => {
    it("projects configured primary Contact Family work as open", () => {
        const departmentMetadata = enrollmentDepartmentMetadata();
        const runtime = projectStageWorkRuntimeSync({
            orgId: "org-1",
            opportunityId: "opp-1",
            departmentId: "dept-1",
            departmentMetadata,
            builderStageKey: "lead",
            openRows: [
                {
                    id: "work-primary",
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
                },
            ],
            completedRows: [],
        });

        expect(runtime?.primary?.state).toBe("open");
        expect(runtime?.primary?.template_key).toBe("contact_family");
        expect(runtime?.additional ?? []).toHaveLength(0);
    });

    it("never returns empty configured stage work", () => {
        const plan = defaultStageOperatingPlanForEnrollmentStage("lead")!;
        expect(plan.work_templates.length).toBeGreaterThan(0);

        const runtime = projectStageWorkRuntimeSync({
            orgId: "org-1",
            opportunityId: "opp-1",
            departmentId: "dept-1",
            departmentMetadata: enrollmentDepartmentMetadata(),
            builderStageKey: "lead",
            openRows: [],
            completedRows: [],
        });

        expect(runtime?.primary?.state).toBe("planned");
        expect(runtime?.additional.every((item) => item.state === "planned")).toBe(true);
    });
});

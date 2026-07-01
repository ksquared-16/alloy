import { describe, expect, it } from "vitest";
import { defaultStageOperatingPlanForEnrollmentStage } from "@/lib/lifecycle/defaultEnrollmentStageOperatingPlans";
import { validateStageOperatingPlanWorkDefinitions } from "@/lib/lifecycle/validateStageOperatingPlanWorkDefinitions";

describe("validateStageOperatingPlanWorkDefinitions", () => {
    it("accepts enrollment default tour stage templates", () => {
        const plan = defaultStageOperatingPlanForEnrollmentStage("tour")!;
        const result = validateStageOperatingPlanWorkDefinitions(plan, { stageKey: "tour" });
        expect(result.ok).toBe(true);
    });

    it("rejects templates that do not resolve", () => {
        const result = validateStageOperatingPlanWorkDefinitions(
            {
                stage_key: "tour",
                work_templates: [
                    {
                        template_key: "orphan_template",
                        label: "Orphan",
                        required: true,
                        due_policy: { kind: "same_day" },
                        owner_strategy: "record_owner",
                    },
                ],
            },
            { stageKey: "tour" },
        );
        expect(result.ok).toBe(false);
        if (!result.ok) {
            expect(result.issues[0]?.reason).toBe("unresolved_definition");
        }
    });
});

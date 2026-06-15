import { describe, expect, it } from "vitest";
import { defaultStageOperatingPlanForEnrollmentStage } from "@/lib/lifecycle/defaultEnrollmentStageOperatingPlans";
import {
    outcomeRulesForKey,
    parseStageOperatingPlanV1,
    successfulOutcomeKeys,
} from "@/lib/lifecycle/stageOperatingPlanV1";

describe("parseStageOperatingPlanV1", () => {
    it("parses valid plan", () => {
        const parsed = parseStageOperatingPlanV1({
            version: 1,
            lifecycle_key: "enrollment",
            stage_key: "lead",
            journey_segment: "family",
            work_templates: [
                {
                    template_key: "contact_1",
                    label: "Contact attempt #1",
                    required: true,
                    due_policy: { kind: "same_day" },
                    owner_strategy: "record_owner",
                },
            ],
            outcomes: [{ outcome_key: "reached_family", label: "Reached family", successful: true }],
            outcome_rules: [
                {
                    rule_key: "r1",
                    when_outcome_key: "reached_family",
                    targets: [{ kind: "move_to_stage", stage_key: "qualification" }],
                },
            ],
            attention_rules: [],
        });
        expect(parsed?.stage_key).toBe("lead");
        expect(parsed?.work_templates).toHaveLength(1);
    });

    it("rejects invalid journey segment", () => {
        expect(
            parseStageOperatingPlanV1({
                version: 1,
                lifecycle_key: "enrollment",
                stage_key: "lead",
                journey_segment: "household",
                work_templates: [],
                outcomes: [],
                outcome_rules: [],
                attention_rules: [],
            }),
        ).toBeNull();
    });
});

describe("defaultStageOperatingPlanForEnrollmentStage", () => {
    it("seeds lead contacting defaults", () => {
        const plan = defaultStageOperatingPlanForEnrollmentStage("lead");
        expect(plan?.journey_segment).toBe("family");
        expect(plan?.work_templates.length).toBeGreaterThanOrEqual(3);
        expect(outcomeRulesForKey(plan!, "reached_family").length).toBeGreaterThan(0);
        expect(successfulOutcomeKeys(plan!).has("reached_family")).toBe(true);
    });

    it("seeds waitlist child journey defaults", () => {
        const plan = defaultStageOperatingPlanForEnrollmentStage("waitlist");
        expect(plan?.journey_segment).toBe("child");
    });
});

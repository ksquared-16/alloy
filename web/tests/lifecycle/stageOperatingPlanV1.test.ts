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

    it("round-trips first-class outgoing transitions and keeps legacy absence compatible", () => {
        const base = {
            version: 1,
            lifecycle_key: "enrollment",
            stage_key: "tour",
            journey_segment: "family",
            work_templates: [],
            outcomes: [],
            outcome_rules: [],
            attention_rules: [],
        };
        expect(parseStageOperatingPlanV1(base)?.outgoing_transitions).toBeUndefined();

        const parsed = parseStageOperatingPlanV1({
            ...base,
            outgoing_transitions: [{
                transition_ref: "tour_to_closed_lost",
                source_stage_key: "tour",
                target_stage_key: "closed_lost",
                label: "Close as Lost",
                available: true,
                status_key: "closed",
                closes_record: true,
            }],
        });
        expect(parsed?.outgoing_transitions).toEqual([{
            transition_ref: "tour_to_closed_lost",
            source_stage_key: "tour",
            target_stage_key: "closed_lost",
            label: "Close as Lost",
            available: true,
            status_key: "closed",
            closes_record: true,
        }]);
    });
});

describe("defaultStageOperatingPlanForEnrollmentStage", () => {
    it("seeds lead stage with Direct Action Contact Family and tour/closed transitions", () => {
        const plan = defaultStageOperatingPlanForEnrollmentStage("lead");
        expect(plan?.journey_segment).toBe("family");
        expect(plan?.work_templates.length).toBe(1);
        const contactFamily = plan?.work_templates.find((t) => t.template_key === "contact_family");
        expect(contactFamily?.execution_mode).toBe("direct_action");
        expect(contactFamily?.primary).toBe(true);
        expect(outcomeRulesForKey(plan!, "reached_family").length).toBeGreaterThan(0);
        expect(successfulOutcomeKeys(plan!).has("reached_family")).toBe(true);
        expect(outcomeRulesForKey(plan!, "left_message").length).toBeGreaterThan(0);
    });

    it("seeds waitlist child journey defaults", () => {
        const plan = defaultStageOperatingPlanForEnrollmentStage("waitlist");
        expect(plan?.journey_segment).toBe("child");
    });
});

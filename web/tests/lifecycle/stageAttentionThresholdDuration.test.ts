import { describe, expect, it } from "vitest";
import {
    attentionRuleUsesElapsedTime,
    attentionThresholdDurationToMs,
    normalizeAttentionThresholdDuration,
} from "@/lib/lifecycle/stageAttentionThresholdDuration";
import { parseStageOperatingPlanV1 } from "@/lib/lifecycle/stageOperatingPlanV1";
import { catalogEntryForAttentionKind } from "@/lib/lifecycle/stageAttentionRuleCatalog";

describe("stage attention elapsed-time duration", () => {
    it("elapsed-time kinds use duration; missing_requirements does not", () => {
        expect(attentionRuleUsesElapsedTime("work_overdue")).toBe(true);
        expect(attentionRuleUsesElapsedTime("stage_age_exceeded")).toBe(true);
        expect(attentionRuleUsesElapsedTime("waiting_on_family")).toBe(true);
        expect(attentionRuleUsesElapsedTime("missing_requirements")).toBe(false);
        expect(catalogEntryForAttentionKind("missing_requirements")?.supportsDuration).toBe(false);
        expect(catalogEntryForAttentionKind("no_contact_attempt")?.supportsDuration).toBe(false);
        expect(catalogEntryForAttentionKind("no_contact_attempt")?.supportsThreshold).toBe(true);
    });

    it("normalizes legacy day thresholds into shared duration", () => {
        const plan = parseStageOperatingPlanV1({
            version: 1,
            lifecycle_key: "enrollment",
            stage_key: "lead",
            journey_segment: "family",
            work_templates: [],
            outcomes: [],
            outcome_rules: [],
            attention_rules: [
                {
                    rule_key: "age",
                    kind: "stage_age_exceeded",
                    threshold: 3,
                    targets: [],
                },
            ],
        });
        expect(plan?.attention_rules[0]?.threshold_duration).toEqual({
            offset_value: 3,
            offset_unit: "days",
        });
    });

    it("supports hours/weeks/months via shared duration ms conversion", () => {
        expect(
            attentionThresholdDurationToMs({ offset_value: 2, offset_unit: "hours" }),
        ).toBe(2 * 60 * 60 * 1000);
        expect(
            attentionThresholdDurationToMs({ offset_value: 1, offset_unit: "weeks" }),
        ).toBe(7 * 24 * 60 * 60 * 1000);
        expect(
            normalizeAttentionThresholdDuration({
                kind: "work_overdue",
                threshold_duration: { offset_value: 45, offset_unit: "minutes" },
            }).offset_unit,
        ).toBe("minutes");
    });
});

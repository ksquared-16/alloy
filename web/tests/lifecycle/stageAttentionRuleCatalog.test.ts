import { describe, expect, it } from "vitest";

import {
    isStageAttentionRuleEvaluatorSupported,
    stageAttentionRuleUnsupportedReason,
} from "@/lib/lifecycle/stageAttentionRuleCatalog";
import { evaluateStageOperatingPlanAttention } from "@/lib/lifecycle/evaluateStageOperatingPlanAttention";

describe("stage attention waiting rules", () => {
    it("waiting_on_family is marked unsupported in catalog", () => {
        expect(isStageAttentionRuleEvaluatorSupported("waiting_on_family")).toBe(false);
        expect(stageAttentionRuleUnsupportedReason("waiting_on_family")).toContain("wait_bucket");
    });

    it("waiting_on_provider is marked unsupported in catalog", () => {
        expect(isStageAttentionRuleEvaluatorSupported("waiting_on_provider")).toBe(false);
        expect(stageAttentionRuleUnsupportedReason("waiting_on_provider")).toContain("waiting_on_staff");
    });

    it("configured waiting rule does not evaluate at runtime", () => {
        const reasons = evaluateStageOperatingPlanAttention({
            plan: {
                version: 1,
                lifecycle_key: "enrollment",
                stage_key: "tour",
                journey_segment: "family",
                work_templates: [],
                outcomes: [],
                outcome_rules: [],
                attention_rules: [
                    {
                        rule_key: "wait_family",
                        kind: "waiting_on_family",
                        label: "Waiting on family",
                        severity: "low",
                        threshold: 3,
                        targets: [],
                    },
                ],
            },
            builderStageKey: "tour",
            nowMs: Date.now(),
            stageEnteredMs: Date.now() - 5 * 24 * 60 * 60 * 1000,
            tasks: [],
        });
        expect(reasons).toHaveLength(0);
    });

    it("work_overdue remains evaluator-supported", () => {
        expect(isStageAttentionRuleEvaluatorSupported("work_overdue")).toBe(true);
        expect(stageAttentionRuleUnsupportedReason("work_overdue")).toBeNull();
    });
});

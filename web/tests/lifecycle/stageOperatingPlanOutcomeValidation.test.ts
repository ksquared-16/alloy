import { describe, expect, it } from "vitest";
import {
    outcomeAutomationIndicators,
    operatingPlanOutcomeSaveWarnings,
} from "@/lib/lifecycle/stageOperatingPlanOutcomeValidation";

describe("stageOperatingPlanOutcomeValidation", () => {
    it("marks outcomes without rules as no automation", () => {
        const indicators = outcomeAutomationIndicators({
            outcomes: [{ outcome_key: "qualified", label: "Qualified", successful: true }],
            outcome_rules: [],
        });
        expect(indicators[0]?.has_automation).toBe(false);
    });

    it("summarizes automation when outcome_rule exists", () => {
        const indicators = outcomeAutomationIndicators({
            outcomes: [{ outcome_key: "reached_family", label: "Reached family" }],
            outcome_rules: [
                {
                    rule_key: "advance",
                    when_outcome_key: "reached_family",
                    targets: [{ kind: "update_family_case_status", status_key: "open" }],
                },
            ],
        });
        expect(indicators[0]?.has_automation).toBe(true);
        expect(indicators[0]?.rule_summaries[0]).toContain("Update family case status");
    });

    it("warns on outcomes without automation", () => {
        const warnings = operatingPlanOutcomeSaveWarnings({
            outcomes: [{ outcome_key: "duplicate", label: "Duplicate" }],
            outcome_rules: [],
        });
        expect(warnings.some((w) => w.kind === "outcome_no_automation")).toBe(true);
    });

    it("warns on orphan outcome rules", () => {
        const warnings = operatingPlanOutcomeSaveWarnings({
            outcomes: [{ outcome_key: "qualified", label: "Qualified" }],
            outcome_rules: [
                {
                    rule_key: "stale_rule",
                    when_outcome_key: "removed_outcome",
                    targets: [{ kind: "no_movement" }],
                },
            ],
        });
        expect(warnings.some((w) => w.kind === "orphan_outcome_rule")).toBe(true);
    });
});

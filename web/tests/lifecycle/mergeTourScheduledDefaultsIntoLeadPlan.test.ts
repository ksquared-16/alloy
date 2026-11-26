import { describe, expect, it } from "vitest";
import { mergeTourScheduledDefaultsIntoLeadPlan } from "@/lib/lifecycle/mergeTourScheduledDefaultsIntoLeadPlan";
import type { StageOperatingPlanV1 } from "@/lib/lifecycle/stageOperatingPlanV1";

describe("mergeTourScheduledDefaultsIntoLeadPlan", () => {
    it("adds Tour Scheduled defaults when the published plan lacks them", () => {
        const published: StageOperatingPlanV1 = {
            version: 1,
            lifecycle_key: "enrollment",
            stage_key: "lead",
            journey_segment: "family",
            work_templates: [
                {
                    template_key: "contact_family",
                    label: "Contact Family",
                    required: true,
                    primary: true,
                    due_policy: { kind: "same_day" },
                    owner_strategy: "record_owner",
                    work_definition_key: "contact_family",
                    completion_policy: { sufficient_command_results: [] },
                },
            ],
            outcomes: [{ outcome_key: "left_message", label: "Left Message" }],
            outcome_rules: [],
            attention_rules: [],
        };

        const { plan, report } = mergeTourScheduledDefaultsIntoLeadPlan(published);
        expect(report.changed).toBe(true);
        expect(report.added_outcomes).toContain("tour_scheduled");
        expect(plan.outcomes.some((o) => o.outcome_key === "tour_scheduled")).toBe(true);
        expect(
            plan.outcome_rules.some((r) => r.when_outcome_key === "tour_scheduled"),
        ).toBe(true);
    });

    it("does not overwrite a tenant outcome_rule that already handles tour_scheduled", () => {
        const published: StageOperatingPlanV1 = {
            version: 1,
            lifecycle_key: "enrollment",
            stage_key: "lead",
            journey_segment: "family",
            work_templates: [
                {
                    template_key: "contact_family",
                    label: "Contact Family",
                    required: true,
                    primary: true,
                    due_policy: { kind: "same_day" },
                    owner_strategy: "record_owner",
                    work_definition_key: "contact_family",
                    completion_policy: {
                        sufficient_command_results: [
                            {
                                capability: "schedule_tour",
                                result: "confirmed",
                                satisfies_outcome_key: "interested",
                            },
                        ],
                    },
                },
            ],
            outcomes: [{ outcome_key: "tour_scheduled", label: "Custom Tour Scheduled" }],
            outcome_rules: [
                {
                    rule_key: "tenant_tour_scheduled",
                    when_outcome_key: "tour_scheduled",
                    targets: [{ kind: "no_movement" }],
                },
            ],
            attention_rules: [],
        };

        const { plan, report } = mergeTourScheduledDefaultsIntoLeadPlan(published);
        expect(report.added_outcomes).toEqual([]);
        expect(report.skipped_conflicts.length).toBeGreaterThan(0);
        expect(plan.outcome_rules.find((r) => r.rule_key === "tenant_tour_scheduled")?.targets).toEqual([
            { kind: "no_movement" },
        ]);
        expect(
            plan.work_templates[0]?.completion_policy?.sufficient_command_results?.[0]?.satisfies_outcome_key,
        ).toBe("interested");
    });
});

import { describe, expect, it, vi } from "vitest";
import {
    formatTransitionReadinessBlockMessage,
    resolveStageChangingDestinationsFromOutcome,
} from "@/lib/lifecycle/preflightStageChangingOutcomeReadiness";
import type { StageOperatingPlanV1 } from "@/lib/lifecycle/stageOperatingPlanV1";
import type { EffectiveRequirementMissing } from "@/lib/lifecycle/requirementTimingTypes";

/**
 * Shaped to the canonical `EffectiveRequirementMissing`. These fixtures previously
 * used `ruleId` and `timing`, neither of which exists on that type — the identity
 * field is `key`, and timing belongs to the rule meta, not to a missing entry.
 */
const missingProgramRequirement: EffectiveRequirementMissing = {
    key: "child:program_interest",
    label: "Program",
    scope: "child",
    enforcement: "blocking",
};

describe("formatTransitionReadinessBlockMessage", () => {
    it("names a single missing Program requirement clearly", () => {
        expect(formatTransitionReadinessBlockMessage([missingProgramRequirement])).toBe(
            "Cannot move stage — Program is required.",
        );
    });
});

describe("resolveStageChangingDestinationsFromOutcome", () => {
    it("resolves move_to_stage destinations from outcome rules", () => {
        const plan: StageOperatingPlanV1 = {
            version: 1,
            lifecycle_key: "enrollment",
            stage_key: "lead",
            journey_segment: "family",
            work_templates: [],
            outcomes: [{ outcome_key: "tour_scheduled", label: "Tour Scheduled" }],
            outcome_rules: [
                {
                    rule_key: "tour_scheduled_to_tour",
                    when_outcome_key: "tour_scheduled",
                    targets: [{ kind: "move_to_stage", transition_ref: "lead_to_tour" }],
                },
            ],
            attention_rules: [],
            outgoing_transitions: [
                {
                    transition_ref: "lead_to_tour",
                    source_stage_key: "lead",
                    target_stage_key: "tour",
                    label: "Continue to Tour",
                    available: true,
                },
            ],
        };

        expect(resolveStageChangingDestinationsFromOutcome({ plan, outcomeKey: "tour_scheduled" })).toEqual([
            { destinationStageKey: "tour", transitionRef: "lead_to_tour" },
        ]);
    });

    it("returns empty when outcome has no stage movement", () => {
        const plan: StageOperatingPlanV1 = {
            version: 1,
            lifecycle_key: "enrollment",
            stage_key: "lead",
            journey_segment: "family",
            work_templates: [],
            outcomes: [{ outcome_key: "left_message", label: "Left Message" }],
            outcome_rules: [
                {
                    rule_key: "left_message_remain",
                    when_outcome_key: "left_message",
                    targets: [{ kind: "no_movement" }],
                },
            ],
            attention_rules: [],
        };

        expect(resolveStageChangingDestinationsFromOutcome({ plan, outcomeKey: "left_message" })).toEqual([]);
    });
});

describe("preflightStageChangingOutcomeReadiness atomicity", () => {
    it("blocks before any mutation when Program is missing for Waitlist transition", async () => {
        vi.resetModules();
        vi.doMock("@/lib/lifecycle/evaluateTransitionRequirementPreflight", () => ({
            evaluateTransitionRequirementPreflight: vi.fn(async () => ({
                missingRequirements: [missingProgramRequirement],
                blockingRequirements: [missingProgramRequirement],
            })),
        }));

        const { preflightStageChangingOutcomeReadiness } = await import(
            "@/lib/lifecycle/preflightStageChangingOutcomeReadiness"
        );

        const plan: StageOperatingPlanV1 = {
            version: 1,
            lifecycle_key: "enrollment",
            stage_key: "decision_pending",
            journey_segment: "child",
            work_templates: [],
            outcomes: [{ outcome_key: "waitlist", label: "Waitlist" }],
            outcome_rules: [
                {
                    rule_key: "to_waitlist",
                    when_outcome_key: "waitlist",
                    targets: [{ kind: "move_to_stage", stage_key: "waitlist" }],
                },
            ],
            attention_rules: [],
        };

        const result = await preflightStageChangingOutcomeReadiness({
            supabase: {} as never,
            orgId: "org-1",
            plan,
            outcomeKey: "waitlist",
            subject: {
                journey_segment: "child",
                opportunity_id: "opp-1",
                customer_member_id: "child-A",
            },
            departmentMetadata: {},
        });

        expect(result.blocked).toBe(true);
        expect(result.message).toContain("Program");
        expect(result.destinationStageKey).toBe("waitlist");
    });
});

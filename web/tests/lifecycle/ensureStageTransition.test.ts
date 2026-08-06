/**
 * Repairing a transition reference through the canonical save path.
 *
 * Transitions were authorable in the stage editor's DRAFT but had no lifecycle-builder action, so
 * a plan whose rules referenced a transition that was never persisted could not be repaired at
 * all: every save was refused by candidate validation, including the save that would have fixed
 * it. Firefly's Lead stage is exactly that — two rules pointing at `lead_to_tour`, with
 * `outgoing_transitions: null`.
 */

import { describe, expect, it } from "vitest";

import {
    ensureStageTransitionInConfig,
    type LifecycleBuilderV1,
} from "@/lib/lifecycle/lifecycleBuilderConfig";
import { validateConfiguredStageReferences } from "@/lib/lifecycle/validateConfiguredStageReferences";

/** Firefly's Lead stage as configured today: rules reference a transition that does not exist. */
function fireflyShapedConfig(): LifecycleBuilderV1 {
    return {
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
                    {
                        id: "s-lead",
                        key: "lead",
                        label: "Lead",
                        sort_order: 0,
                        is_active: true,
                        grain: "family",
                        stage_operating_plan_v1: {
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
                                {
                                    rule_key: "domain_tour_booking_scheduled_to_tour",
                                    when_domain_signal: { domain: "tour_booking", event: "scheduled" },
                                    targets: [{ kind: "move_to_stage", transition_ref: "lead_to_tour" }],
                                },
                            ],
                            attention_rules: [],
                        },
                    },
                    { id: "s-tour", key: "tour", label: "Tour", sort_order: 1, is_active: true, grain: "family" },
                    { id: "s-wait", key: "waitlist", label: "Waitlist", sort_order: 2, is_active: true, grain: "child" },
                ],
            },
        ],
    } as unknown as LifecycleBuilderV1;
}

const leadOf = (c: LifecycleBuilderV1) => c.processes[0]!.stages.find((s) => s.key === "lead")!;

describe("the two defects are distinguishable", () => {
    it("a missing TRANSITION says so, and names the transition", () => {
        const result = validateConfiguredStageReferences(fireflyShapedConfig());
        expect(result.ok).toBe(false);
        if (result.ok) throw new Error("expected violations");
        const v = result.violations[0]!;
        expect(v.defect).toBe("missing_transition");
        expect(v.message).toBe(
            'This outcome refers to transition "lead_to_tour", but that transition is not '
            + "configured on the lead stage. Create or select an outgoing transition before publishing.",
        );
        // The old copy claimed a missing STAGE and listed configured stages — the wrong noun.
        expect(v.message).not.toContain("targets stage");
    });

    it("a missing DESTINATION STAGE says so, and names the stage", () => {
        const config = fireflyShapedConfig();
        leadOf(config).stage_operating_plan_v1!.outgoing_transitions = [
            {
                transition_ref: "lead_to_tour",
                source_stage_key: "lead",
                target_stage_key: "nowhere",
                label: "x",
                available: true,
            },
        ] as never;
        const result = validateConfiguredStageReferences(config);
        if (result.ok) throw new Error("expected violations");
        const v = result.violations.find((x) => x.defect === "missing_destination_stage")!;
        expect(v.message).toContain('points to stage "nowhere"');
    });
});

describe("ensure_stage_transition", () => {
    it("turns the known invalid candidate into a valid one", () => {
        const before = fireflyShapedConfig();
        expect(validateConfiguredStageReferences(before).ok).toBe(false);

        const { config, transition_ref, created } = ensureStageTransitionInConfig(
            before,
            "proc-1",
            "lead",
            "tour",
            "lead_to_tour",
        );
        expect(created).toBe(true);
        expect(transition_ref).toBe("lead_to_tour");
        expect(validateConfiguredStageReferences(config).ok).toBe(true);
    });

    it("leaves both existing movement rules byte-identical", () => {
        const before = fireflyShapedConfig();
        const rulesBefore = JSON.parse(JSON.stringify(leadOf(before).stage_operating_plan_v1!.outcome_rules));
        const { config } = ensureStageTransitionInConfig(before, "proc-1", "lead", "tour", "lead_to_tour");
        expect(leadOf(config).stage_operating_plan_v1!.outcome_rules).toEqual(rulesBefore);
    });

    it("creates exactly one transition", () => {
        const { config } = ensureStageTransitionInConfig(
            fireflyShapedConfig(), "proc-1", "lead", "tour", "lead_to_tour",
        );
        const transitions = leadOf(config).stage_operating_plan_v1!.outgoing_transitions!;
        expect(transitions).toHaveLength(1);
        expect(transitions[0]).toMatchObject({
            transition_ref: "lead_to_tour",
            source_stage_key: "lead",
            target_stage_key: "tour",
            available: true,
        });
    });

    it("is idempotent — a second invocation creates nothing", () => {
        const first = ensureStageTransitionInConfig(
            fireflyShapedConfig(), "proc-1", "lead", "tour", "lead_to_tour",
        );
        const second = ensureStageTransitionInConfig(first.config, "proc-1", "lead", "tour", "lead_to_tour");
        expect(second.created).toBe(false);
        expect(second.config).toBe(first.config);
    });

    it("reuses an existing path to the same destination rather than duplicating", () => {
        const first = ensureStageTransitionInConfig(fireflyShapedConfig(), "proc-1", "lead", "tour");
        const second = ensureStageTransitionInConfig(first.config, "proc-1", "lead", "tour");
        expect(second.created).toBe(false);
        expect(second.transition_ref).toBe(first.transition_ref);
    });

    it("rejects a ref collision that points somewhere else", () => {
        const first = ensureStageTransitionInConfig(
            fireflyShapedConfig(), "proc-1", "lead", "tour", "lead_to_tour",
        );
        expect(() =>
            ensureStageTransitionInConfig(first.config, "proc-1", "lead", "waitlist", "lead_to_tour"),
        ).toThrow(/already moves to "tour"/);
    });

    it("rejects a self-transition", () => {
        expect(() =>
            ensureStageTransitionInConfig(fireflyShapedConfig(), "proc-1", "lead", "lead"),
        ).toThrow(/cannot transition to itself/);
    });

    it("rejects unknown stages", () => {
        expect(() => ensureStageTransitionInConfig(fireflyShapedConfig(), "proc-1", "nope", "tour")).toThrow(
            "Source stage not found",
        );
        expect(() => ensureStageTransitionInConfig(fireflyShapedConfig(), "proc-1", "lead", "nope")).toThrow(
            "Target stage not found",
        );
    });

    it("does not mutate the config it was given", () => {
        const before = fireflyShapedConfig();
        const snapshot = JSON.parse(JSON.stringify(before));
        ensureStageTransitionInConfig(before, "proc-1", "lead", "tour", "lead_to_tour");
        expect(before).toEqual(snapshot);
    });

    it("leaves an UNRELATED invalid candidate still blocked", () => {
        // Repairing one reference must not launder a different defect.
        const config = fireflyShapedConfig();
        leadOf(config).stage_operating_plan_v1!.outcome_rules.push({
            rule_key: "broken",
            when_outcome_key: "tour_scheduled",
            targets: [{ kind: "move_to_stage", stage_key: "atlantis" }],
        } as never);
        const repaired = ensureStageTransitionInConfig(config, "proc-1", "lead", "tour", "lead_to_tour");
        expect(validateConfiguredStageReferences(repaired.config).ok).toBe(false);
    });
});

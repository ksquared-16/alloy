/**
 * Configured transition ref -> typed canonical destination.
 *
 * The point of these cases is that a configured string is never authority by itself: it resolves
 * only against the transitions the tenant's configuration offers FROM THE SUBJECT'S CURRENT STAGE,
 * and anything unclear fails closed rather than picking a destination.
 */
import { describe, expect, it } from "vitest";
import { resolveConfiguredTransitionRef } from "@/lib/admin/enrollmentStatus/resolveConfiguredTransitionRef";

const STAGES = [
    { key: "lead", label: "Lead" },
    { key: "tour", label: "Tour" },
    { key: "waitlist", label: "Waitlist" },
    { key: "decision", label: "Decision" },
];

/** A stage operating plan with two authored transitions out of `lead`, and one out of `tour`. */
const PLAN = {
    outgoing_transitions: [
        {
            transition_ref: "lead_to_tour",
            label: "Schedule tour",
            source_stage_key: "lead",
            target_stage_key: "tour",
            available: true,
            status_key: "open",
        },
        {
            transition_ref: "lead_to_waitlist",
            label: "Move to waitlist",
            source_stage_key: "lead",
            target_stage_key: "waitlist",
            available: true,
        },
        {
            transition_ref: "tour_to_decision",
            label: "Record decision",
            source_stage_key: "tour",
            target_stage_key: "decision",
            available: true,
        },
    ],
} as never;

describe("resolveConfiguredTransitionRef", () => {
    it("resolves an authored ref to the typed destination its target stage maps to", () => {
        const r = resolveConfiguredTransitionRef({
            ref: "lead_to_tour",
            currentStageKey: "lead",
            stageOperatingPlan: PLAN,
            processStages: STAGES,
        });
        expect(r.ok).toBe(true);
        if (!r.ok) return;
        expect(r.destinationKey).toBe("tour");
        expect(r.transition.transition_ref).toBe("lead_to_tour");
    });

    it("carries the configured resulting status through rather than re-deriving it", () => {
        const r = resolveConfiguredTransitionRef({
            ref: "lead_to_tour",
            currentStageKey: "lead",
            stageOperatingPlan: PLAN,
            processStages: STAGES,
        });
        expect(r.ok && r.targetStatusKey).toBe("open");
    });

    it("preserves the typed destination type — never the raw configured string", () => {
        const r = resolveConfiguredTransitionRef({
            ref: "lead_to_waitlist",
            currentStageKey: "lead",
            stageOperatingPlan: PLAN,
            processStages: STAGES,
        });
        // "waitlist" is a LifecycleOperatorStage, not the ref that asked for it.
        expect(r.ok && r.destinationKey).toBe("waitlist");
        expect(r.ok && r.destinationKey).not.toBe("lead_to_waitlist");
    });

    it("fails closed on an unknown ref", () => {
        const r = resolveConfiguredTransitionRef({
            ref: "not_a_configured_ref",
            currentStageKey: "lead",
            stageOperatingPlan: PLAN,
            processStages: STAGES,
        });
        expect(r).toEqual({ ok: false, reason: "unknown_ref" });
    });

    it("refuses a ref authored out of a DIFFERENT stage — scope is the current stage", () => {
        // `tour_to_decision` is real configuration, just not reachable from `lead`. Resolving it
        // would let a client reach any destination by naming a string that exists somewhere.
        const r = resolveConfiguredTransitionRef({
            ref: "tour_to_decision",
            currentStageKey: "lead",
            stageOperatingPlan: PLAN,
            processStages: STAGES,
        });
        expect(r).toEqual({ ok: false, reason: "unknown_ref" });
    });

    it("fails closed when the configuration is ambiguous", () => {
        const ambiguous = {
            outgoing_transitions: [
                { transition_ref: "dup", label: "A", source_stage_key: "lead", target_stage_key: "tour", available: true },
                { transition_ref: "dup", label: "B", source_stage_key: "lead", target_stage_key: "waitlist", available: true },
            ],
        } as never;
        const r = resolveConfiguredTransitionRef({
            ref: "dup",
            currentStageKey: "lead",
            stageOperatingPlan: ambiguous,
            processStages: STAGES,
        });
        expect(r).toEqual({ ok: false, reason: "ambiguous_ref" });
    });

    it("refuses a configured transition the operator cannot currently take", () => {
        const unavailable = {
            outgoing_transitions: [
                { transition_ref: "blocked", label: "X", source_stage_key: "lead", target_stage_key: "tour", available: false },
            ],
        } as never;
        const r = resolveConfiguredTransitionRef({
            ref: "blocked",
            currentStageKey: "lead",
            stageOperatingPlan: unavailable,
            processStages: STAGES,
        });
        expect(r).toEqual({ ok: false, reason: "transition_unavailable" });
    });

    it("refuses a transition whose target stage has no typed canonical destination", () => {
        const unmapped = {
            outgoing_transitions: [
                { transition_ref: "to_nowhere", label: "Y", source_stage_key: "lead", target_stage_key: "not_a_stage", available: true },
            ],
        } as never;
        const r = resolveConfiguredTransitionRef({
            ref: "to_nowhere",
            currentStageKey: "lead",
            stageOperatingPlan: unmapped,
            // `not_a_stage` is filtered out as an unknown stage, so this reads as unknown_ref.
            processStages: STAGES,
        });
        expect(r.ok).toBe(false);
    });

    it("resolves nothing for an empty ref or an empty stage", () => {
        for (const bad of [
            { ref: "", currentStageKey: "lead" },
            { ref: "lead_to_tour", currentStageKey: "" },
        ]) {
            const r = resolveConfiguredTransitionRef({ ...bad, stageOperatingPlan: PLAN, processStages: STAGES });
            expect(r).toEqual({ ok: false, reason: "unknown_ref" });
        }
    });

    it("never mutates: resolution is a pure read of configuration", () => {
        const before = JSON.stringify(PLAN);
        resolveConfiguredTransitionRef({
            ref: "lead_to_tour",
            currentStageKey: "lead",
            stageOperatingPlan: PLAN,
            processStages: STAGES,
        });
        expect(JSON.stringify(PLAN)).toBe(before);
    });
});

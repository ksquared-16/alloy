/**
 * A saved exit path that crosses journey tracks must be REPORTED, not repaired.
 *
 * Sub-slice 2 filtered the destination picker and refused the write at execution. Neither helps a
 * plan that already holds such a path: the picker only shapes new choices, and an execution-time
 * refusal arrives long after publish. This validation reports it at authoring time.
 *
 * The rule these tests exist to hold: nothing is filtered, deleted, replaced or normalised. The
 * saved transition and the outcome rule stay byte-identical and stay visible; a blocking issue is
 * added beside them. Silently "repairing" configuration an operator authored is how intent is lost.
 */

import { describe, expect, it } from "vitest";

import {
    stageOperatingContractHasBlockingErrors,
    validateStageOperatingPlanOperatingContract,
} from "@/lib/lifecycle/validateStageOperatingPlanOperatingContract";
import type { StageOperatingPlanV1 } from "@/lib/lifecycle/stageOperatingPlanV1";

const STAGES = [
    { key: "lead", label: "Lead", grain: "family" },
    { key: "tour", label: "Tour", grain: "family" },
    { key: "closed", label: "Closed", grain: "family" },
    { key: "waitlist", label: "Waitlist", grain: "child" },
    { key: "closed_withdrawn", label: "Closed / Not Enrolling", grain: "child" },
    { key: "mystery", label: "Mystery" },
];

function planMovingTo(
    journey: "family" | "child",
    stageKey: string,
    targetStageKey: string,
): StageOperatingPlanV1 {
    return {
        version: 1,
        lifecycle_key: "enrollment",
        stage_key: stageKey,
        journey_segment: journey,
        work_templates: [],
        outcomes: [{ outcome_key: "declined", label: "Declined" }],
        outcome_rules: [
            {
                rule_key: "declined_move",
                when_outcome_key: "declined",
                targets: [{ kind: "move_to_stage", transition_ref: "path_1" }],
            },
        ],
        outgoing_transitions: [
            {
                transition_ref: "path_1",
                source_stage_key: stageKey,
                target_stage_key: targetStageKey,
                label: "Saved path",
                available: true,
            },
        ],
        attention_rules: [],
    } as unknown as StageOperatingPlanV1;
}

const validate = (plan: StageOperatingPlanV1) =>
    validateStageOperatingPlanOperatingContract({
        plan,
        processStages: STAGES,
        processStageKeys: STAGES.map((s) => s.key),
        transitionOptions: (plan.outgoing_transitions ?? []).map((t) => ({
            transition_ref: t.transition_ref,
            label: t.label,
            target_stage_key: t.target_stage_key,
            target_stage_label: t.target_stage_key,
        })),
    });

describe("a saved cross-grain path is reported", () => {
    it("family → child produces a blocking issue in operator language", () => {
        const issues = validate(planMovingTo("family", "lead", "waitlist"));
        const outcome = issues.find((i) => i.code === "outcome_movement_grain_mismatch");
        expect(outcome).toBeDefined();
        expect(outcome!.severity).toBe("error");
        expect(outcome!.message).toBe(
            'This outcome moves a family to "Waitlist", which is configured for individual '
            + "children. Choose a family stage instead.",
        );
        expect(stageOperatingContractHasBlockingErrors(issues)).toBe(true);
    });

    it("child → family produces a blocking issue in operator language", () => {
        const issues = validate(planMovingTo("child", "waitlist", "closed"));
        const outcome = issues.find((i) => i.code === "outcome_movement_grain_mismatch");
        expect(outcome!.message).toBe(
            'This outcome moves a child to "Closed", which is configured for the family case. '
            + "Choose a child stage instead.",
        );
        expect(stageOperatingContractHasBlockingErrors(issues)).toBe(true);
    });

    it("reports the path itself as well as the outcome that uses it", () => {
        const issues = validate(planMovingTo("family", "lead", "waitlist"));
        expect(issues.some((i) => i.code === "transition_destination_grain_mismatch")).toBe(true);
        expect(issues.some((i) => i.code === "outcome_movement_grain_mismatch")).toBe(true);
    });

    it("says nothing about a compatible saved path", () => {
        const issues = validate(planMovingTo("family", "lead", "tour"));
        expect(issues.filter((i) => i.code.includes("grain"))).toEqual([]);
    });

    it("blocks a destination whose grain cannot be resolved", () => {
        const issues = validate(planMovingTo("family", "lead", "mystery"));
        const issue = issues.find((i) => i.code === "transition_destination_grain_unresolved");
        expect(issue).toBeDefined();
        expect(issue!.message).toContain("does not say clearly whether it belongs");
        expect(stageOperatingContractHasBlockingErrors(issues)).toBe(true);
    });

    it("blocks a destination whose configured grain contradicts the canonical vocabulary", () => {
        // Firefly's Decision: canonical says family, department metadata says child.
        const contradictory = [...STAGES, { key: "decision", label: "Decision", grain: "child" }];
        const plan = planMovingTo("family", "lead", "decision");
        const issues = validateStageOperatingPlanOperatingContract({
            plan,
            processStages: contradictory,
            processStageKeys: contradictory.map((s) => s.key),
        });
        expect(issues.some((i) => i.code === "transition_destination_grain_unresolved")).toBe(true);
        expect(stageOperatingContractHasBlockingErrors(issues)).toBe(true);
    });

    it("is skipped, never guessed, when the plan does not state its grain", () => {
        const plan = planMovingTo("family", "lead", "waitlist");
        delete (plan as { journey_segment?: unknown }).journey_segment;
        expect(validate(plan).filter((i) => i.code.includes("grain"))).toEqual([]);
    });

    it("is skipped when the caller supplied no configured stages", () => {
        const plan = planMovingTo("family", "lead", "waitlist");
        const issues = validateStageOperatingPlanOperatingContract({ plan });
        expect(issues.filter((i) => i.code.includes("grain"))).toEqual([]);
    });
});

describe("the saved configuration is preserved", () => {
    it("leaves the transition and the outcome rule byte-identical", () => {
        const plan = planMovingTo("family", "lead", "waitlist");
        const before = JSON.parse(JSON.stringify(plan));
        validate(plan);
        expect(plan).toEqual(before);
    });

    it("keeps the incompatible path present, not filtered away", () => {
        const plan = planMovingTo("family", "lead", "waitlist");
        validate(plan);
        expect(plan.outgoing_transitions).toHaveLength(1);
        expect(plan.outgoing_transitions![0]!.target_stage_key).toBe("waitlist");
        expect(plan.outcome_rules[0]!.targets[0]).toEqual({
            kind: "move_to_stage",
            transition_ref: "path_1",
        });
    });
});

describe("issue identity is stable", () => {
    it("produces no duplicate render keys", () => {
        const issues = validate(planMovingTo("family", "lead", "waitlist"));
        const keys = issues.map((i) => `${i.controlId}:${i.code}`);
        expect(new Set(keys).size).toBe(keys.length);
    });

    it("anchors each issue to the control that owns it", () => {
        const issues = validate(planMovingTo("family", "lead", "waitlist"));
        expect(issues.find((i) => i.code === "transition_destination_grain_mismatch")!.controlId).toBe(
            "stage-transition-path_1",
        );
        const outcome = issues.find((i) => i.code === "outcome_movement_grain_mismatch")!;
        expect(outcome.controlId).toBe("stage-outcome-automation-declined-transition");
        expect(outcome.outcome_key).toBe("declined");
    });

    it("is deterministic across repeated validation", () => {
        const plan = planMovingTo("family", "lead", "waitlist");
        expect(validate(plan)).toEqual(validate(plan));
    });
});

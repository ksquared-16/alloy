/**
 * Plan-then-mutate for configured stage outcomes (Law 6) — the Firefly failure, directly.
 *
 * The automation path called the target executor without ever expanding a `move_to_stage` through
 * its transition. The modern editor writes movement as
 * `{ kind: "move_to_stage", transition_ref: "lead_to_tour" }` with no `stage_key`, so the executor
 * looked for a stage key, found none, and failed — after the status target in the same rule had
 * already committed. Status moved, stage did not.
 */

import { describe, expect, it } from "vitest";

import { planStageOutcomeExecution } from "@/lib/lifecycle/planStageOutcomeExecution";
import type {
    StageOperatingPlanV1,
    StageOutcomeRuleV1,
} from "@/lib/lifecycle/stageOperatingPlanV1";

const LEAD_TO_TOUR = {
    transition_ref: "lead_to_tour",
    source_stage_key: "lead",
    target_stage_key: "tour",
    label: "Lead → Tour",
    available: true,
};

function plan(over?: Partial<StageOperatingPlanV1>): StageOperatingPlanV1 {
    return {
        version: 1,
        lifecycle_key: "enrollment",
        stage_key: "lead",
        journey_segment: "family",
        outgoing_transitions: [LEAD_TO_TOUR],
        work_templates: [],
        outcomes: [],
        outcome_rules: [],
        attention_rules: [],
        ...over,
    } as StageOperatingPlanV1;
}

/** The shape the editor writes: a status change AND a move, in one rule. */
function statusThenMoveRule(transitionRef = "lead_to_tour"): StageOutcomeRuleV1 {
    return {
        rule_key: "tour_scheduled_behavior",
        when_outcome_key: "tour_scheduled",
        targets: [
            { kind: "create_needs_attention", attention_reason: "Follow up" },
            { kind: "move_to_stage", transition_ref: transitionRef },
        ],
    } as StageOutcomeRuleV1;
}

describe("execution preflight", () => {
    it("expands a transition_ref move into executable primitives", () => {
        const p = plan({
            outgoing_transitions: [{ ...LEAD_TO_TOUR, status_key: "open" }],
        });
        const result = planStageOutcomeExecution([
            { stageKey: "lead", plan: p, rule: statusThenMoveRule() },
        ]);

        expect(result.errors).toEqual([]);
        // attention + the transition's status change + the stage move.
        expect(result.steps.map((s) => s.executable.kind)).toEqual([
            "create_needs_attention",
            "update_family_case_status",
            "move_to_stage",
        ]);
        const move = result.steps.find((s) => s.executable.kind === "move_to_stage")!;
        // The destination the executor needs, which the un-expanded target never carried.
        expect(move.executable.stage_key).toBe("tour");
        expect(move.executable.transition_ref).toBe("lead_to_tour");
    });

    it("reports an unresolvable transition and plans NOTHING — no partial mutation is possible", () => {
        // The Firefly graph: the rule names a transition the stage does not declare.
        const p = plan({ outgoing_transitions: [] });
        const result = planStageOutcomeExecution([
            { stageKey: "lead", plan: p, rule: statusThenMoveRule() },
        ]);

        expect(result.errors).toHaveLength(1);
        expect(result.errors[0]).toContain("lead/tour_scheduled_behavior");
        expect(result.errors[0]).toContain("lead_to_tour");
        expect(result.unresolvable_rule_keys).toEqual(["tour_scheduled_behavior"]);

        // The attention target is still PLANNED — the caller is what must refuse to run anything
        // while `errors` is non-empty. That contract is asserted below.
        expect(result.steps.map((s) => s.executable.kind)).toEqual(["create_needs_attention"]);
    });

    it("reports an unavailable transition rather than executing it", () => {
        const p = plan({ outgoing_transitions: [{ ...LEAD_TO_TOUR, available: false }] });
        const result = planStageOutcomeExecution([
            { stageKey: "lead", plan: p, rule: statusThenMoveRule() },
        ]);
        expect(result.errors[0]).toContain("unavailable");
    });

    it("reports a move with no transition_ref at all on a plan that uses transitions", () => {
        const p = plan();
        const rule = {
            rule_key: "bare",
            when_outcome_key: "x",
            targets: [{ kind: "move_to_stage" }],
        } as unknown as StageOutcomeRuleV1;
        const result = planStageOutcomeExecution([{ stageKey: "lead", plan: p, rule }]);
        expect(result.errors[0]).toContain("requires transition_ref");
    });

    it("still executes a genuinely legacy plan that has no transition collection", () => {
        // `outgoing_transitions: undefined` is the pre-transition shape; a bare stage_key is its
        // only way to move, and removing that would break tenants that never migrated.
        const p = plan({ outgoing_transitions: undefined });
        const rule = {
            rule_key: "legacy",
            when_outcome_key: "x",
            targets: [{ kind: "move_to_stage", stage_key: "tour" }],
        } as unknown as StageOutcomeRuleV1;
        const result = planStageOutcomeExecution([{ stageKey: "lead", plan: p, rule }]);
        expect(result.errors).toEqual([]);
        expect(result.steps[0]!.executable.stage_key).toBe("tour");
    });

    it("is pure — planning twice changes nothing", () => {
        const p = plan();
        const rule = statusThenMoveRule();
        const before = JSON.stringify({ p, rule });
        planStageOutcomeExecution([{ stageKey: "lead", plan: p, rule }]);
        planStageOutcomeExecution([{ stageKey: "lead", plan: p, rule }]);
        expect(JSON.stringify({ p, rule })).toBe(before);
    });
});

describe("the automation path refuses to mutate on an unresolvable plan", () => {
    it("aborts before the first durable write and reports every rule as failed", async () => {
        const { readFileSync } = await import("fs");
        const { resolve } = await import("path");
        const src = readFileSync(
            resolve(__dirname, "../../lib/lifecycle/applyConfiguredStageAutomationRules.ts"),
            "utf8",
        );

        // The plan phase must come first, and the early return must precede any executor call.
        const planIndex = src.indexOf("planStageOutcomeExecution(params.matched)");
        const guardIndex = src.indexOf("if (executionPlan.errors.length)");
        const firstWriteIndex = src.indexOf("await applyStageOutcomeRuleTarget(");
        expect(planIndex).toBeGreaterThan(-1);
        expect(guardIndex).toBeGreaterThan(planIndex);
        expect(firstWriteIndex).toBeGreaterThan(guardIndex);

        // And the inverse of every durable step must now be captured — the previous code dropped
        // `result.undo` on the floor, which is why a partial application was permanent.
        expect(src).toContain("if (result.undo)");
        expect(src).toContain("undo[i]!.run()");
        expect(src).toContain("compensation failed for");
    });
});

describe("code defaults are not runtime transition authority (decision D1)", () => {
    it("the effective-plan resolver only falls back when NO process is configured", async () => {
        const { readFileSync } = await import("fs");
        const { resolve } = await import("path");
        const src = readFileSync(
            resolve(__dirname, "../../lib/lifecycle/resolveEffectiveStageOperatingPlan.ts"),
            "utf8",
        );
        // The default may still describe work and outcomes; it may never describe MOVEMENT.
        // `lead_to_tour` resolved out of code was what made the Lead→Tour failure unfalsifiable.
        expect(src).toContain("stripTransitionsFromDefaultPlan");
        expect(src).toContain("outgoing_transitions: []");
        expect(src).toContain('t.kind !== "move_to_stage"');
    });

    it("a code-default plan can describe work but can never move a subject", async () => {
        const { resolveEffectiveStageOperatingPlan } = await import(
            "@/lib/lifecycle/resolveEffectiveStageOperatingPlan"
        );
        // A configured enrollment process whose `lead` stage has no explicit plan.
        const resolved = resolveEffectiveStageOperatingPlan({
            builderStageKey: "lead",
            departmentMetadata: {
                lifecycle_builder_v1: {
                    version: 1,
                    active_process_id: "p1",
                    processes: [
                        {
                            id: "p1",
                            key: "enrollment",
                            name: "Enrollment",
                            primary_entity: "opportunity",
                            sort_order: 0,
                            is_active: true,
                            stages: [
                                { id: "s1", key: "lead", label: "Lead", sort_order: 0, is_active: true },
                                { id: "s2", key: "tour", label: "Tour", sort_order: 1, is_active: true },
                            ],
                        },
                    ],
                },
            },
        });

        expect(resolved.source).toBe("enrollment_default");
        expect(resolved.plan).not.toBeNull();
        // The shipped default DOES declare lead_to_tour. It must not survive into runtime.
        expect(resolved.plan!.outgoing_transitions).toEqual([]);
        const moves = (resolved.plan!.outcome_rules ?? []).flatMap((r) =>
            (r.targets ?? []).filter((t) => t.kind === "move_to_stage"),
        );
        expect(moves).toEqual([]);
    });
});

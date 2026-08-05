/**
 * Stage grain becomes authorable.
 *
 * `grain` was persisted authored configuration with NO authoring path: the enrollment template
 * seeded it from `track_key`, `add_stage` wrote it once, and nothing in the product could correct
 * it. That is how Firefly's Decision stage came to declare `child` while its own operating plan
 * and the canonical vocabulary both say `family` — visible to an operator, fixable by no one.
 *
 * Two rules these tests hold: the change is refused when it would contradict the platform or
 * strand saved paths on the wrong track, and it never disturbs unrelated configuration.
 */

import { describe, expect, it } from "vitest";

import { evaluateStageGrainChange } from "@/lib/lifecycle/stageGrainChangePreflight";
import { updateStageGrain, type LifecycleBuilderV1 } from "@/lib/lifecycle/lifecycleBuilderConfig";
import type { StageOperatingPlanV1 } from "@/lib/lifecycle/stageOperatingPlanV1";

const planFor = (stageKey: string, journey: "family" | "child", targets: string[] = []) =>
    ({
        version: 1,
        lifecycle_key: "enrollment",
        stage_key: stageKey,
        journey_segment: journey,
        work_templates: [],
        outcomes: [],
        outcome_rules: [],
        outgoing_transitions: targets.map((t, i) => ({
            transition_ref: `${stageKey}_to_${t}`,
            source_stage_key: stageKey,
            target_stage_key: t,
            label: `to ${t}`,
            available: true,
            sort_order: i,
        })),
        attention_rules: [],
    }) as unknown as StageOperatingPlanV1;

function config(): LifecycleBuilderV1 {
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
                    { id: "s-lead", key: "lead", label: "Lead", sort_order: 0, is_active: true, grain: "family" },
                    { id: "s-tour", key: "tour", label: "Tour", sort_order: 1, is_active: true, grain: "family" },
                    {
                        id: "s-decision",
                        key: "decision",
                        label: "Decision",
                        sort_order: 2,
                        is_active: true,
                        grain: "child",
                        stage_operating_plan_v1: planFor("decision", "family"),
                    },
                    { id: "s-wait", key: "waitlist", label: "Waitlist", sort_order: 3, is_active: true, grain: "child" },
                ],
            },
        ],
    } as unknown as LifecycleBuilderV1;
}

const stagesOf = (c: LifecycleBuilderV1) => c.processes[0]!.stages;
const decisionOf = (c: LifecycleBuilderV1) => stagesOf(c).find((s) => s.id === "s-decision")!;

describe("the mutator", () => {
    it("changes only the requested stage's grain", () => {
        const before = config();
        const after = updateStageGrain(before, "proc-1", "s-decision", "family");
        expect(decisionOf(after).grain).toBe("family");
        for (const id of ["s-lead", "s-tour", "s-wait"]) {
            expect(stagesOf(after).find((s) => s.id === id)).toEqual(
                stagesOf(before).find((s) => s.id === id),
            );
        }
    });

    it("keeps the operating plan's journey_segment aligned in the same save", () => {
        // One concept, not two parallel declarations that can drift.
        const after = updateStageGrain(config(), "proc-1", "s-decision", "child");
        expect(decisionOf(after).grain).toBe("child");
        expect(decisionOf(after).stage_operating_plan_v1?.journey_segment).toBe("child");
    });

    it("is idempotent — a no-op returns the same object, so no diff can appear", () => {
        const before = updateStageGrain(config(), "proc-1", "s-decision", "family");
        expect(updateStageGrain(before, "proc-1", "s-decision", "family")).toBe(before);
    });

    it("leaves stage order, keys, labels and plans untouched", () => {
        const before = config();
        const after = updateStageGrain(before, "proc-1", "s-decision", "family");
        expect(stagesOf(after).map((s) => s.key)).toEqual(stagesOf(before).map((s) => s.key));
        expect(stagesOf(after).map((s) => s.sort_order)).toEqual(stagesOf(before).map((s) => s.sort_order));
        expect(after.active_process_id).toBe(before.active_process_id);
        expect(before).toEqual(config()); // input not mutated
    });

    it("rejects an unknown stage or process", () => {
        expect(() => updateStageGrain(config(), "proc-1", "s-nope", "family")).toThrow("Stage not found");
        expect(() => updateStageGrain(config(), "proc-nope", "s-decision", "family")).toThrow("Process not found");
    });
});

describe("the preflight", () => {
    const stages = [
        { key: "lead", label: "Lead", grain: "family" },
        { key: "tour", label: "Tour", grain: "family" },
        { key: "decision", label: "Decision", grain: "child" },
        { key: "waitlist", label: "Waitlist", grain: "child" },
    ];

    it("allows the Firefly Decision correction", () => {
        const decision = evaluateStageGrainChange({
            stageKey: "decision",
            requestedGrain: "family",
            currentConfiguredGrain: "child",
            operatingPlan: planFor("decision", "family"),
            processStages: stages,
        });
        expect(decision.allowed).toBe(true);
        if (decision.allowed) {
            expect(decision.from).toBe("child");
            expect(decision.to).toBe("family");
            expect(decision.unchanged).toBe(false);
        }
    });

    it("blocks a change that contradicts the canonical vocabulary", () => {
        // `waitlist` is defined by the platform as child-grain.
        const decision = evaluateStageGrainChange({
            stageKey: "waitlist",
            requestedGrain: "family",
            currentConfiguredGrain: "child",
            processStages: stages,
        });
        expect(decision.allowed).toBe(false);
        if (!decision.allowed) {
            expect(decision.blockers[0]!.code).toBe("canonical_vocabulary_conflict");
            expect(decision.blockers[0]!.message).toContain("individual children");
        }
    });

    it("blocks when a saved way OUT would land on the other journey", () => {
        const decision = evaluateStageGrainChange({
            stageKey: "tenant_stage",
            requestedGrain: "family",
            currentConfiguredGrain: "child",
            operatingPlan: planFor("tenant_stage", "child", ["waitlist"]),
            processStages: [...stages, { key: "tenant_stage", label: "Tenant Stage", grain: "child" }],
        });
        expect(decision.allowed).toBe(false);
        if (!decision.allowed) {
            expect(decision.blockers[0]!.code).toBe("outgoing_transition_conflict");
            expect(decision.blockers[0]!.stage_keys).toEqual(["waitlist"]);
        }
    });

    it("blocks when a saved way IN would arrive from the other journey", () => {
        const decision = evaluateStageGrainChange({
            stageKey: "tenant_stage",
            requestedGrain: "child",
            currentConfiguredGrain: "family",
            processStages: [...stages, { key: "tenant_stage", label: "Tenant Stage", grain: "family" }],
            otherStagePlans: [planFor("tour", "family", ["tenant_stage"])],
        });
        expect(decision.allowed).toBe(false);
        if (!decision.allowed) expect(decision.blockers[0]!.code).toBe("incoming_transition_conflict");
    });

    it("reports an unchanged request as allowed and unchanged", () => {
        const decision = evaluateStageGrainChange({
            stageKey: "tour",
            requestedGrain: "family",
            currentConfiguredGrain: "family",
            processStages: stages,
        });
        expect(decision.allowed && decision.unchanged).toBe(true);
    });

    it("decides without touching its inputs", () => {
        const stagesCopy = JSON.parse(JSON.stringify(stages));
        const plan = planFor("decision", "family");
        const planCopy = JSON.parse(JSON.stringify(plan));
        evaluateStageGrainChange({
            stageKey: "decision",
            requestedGrain: "family",
            currentConfiguredGrain: "child",
            operatingPlan: plan,
            processStages: stagesCopy,
        });
        expect(stagesCopy).toEqual(stages);
        expect(plan).toEqual(planCopy);
    });
});

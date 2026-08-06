/**
 * The editor and the runtime must judge stage grain from the SAME evidence.
 *
 * Both already used `resolveStageGrain`, but they were fed differently: runtime read the
 * department's configured stage metadata, while the editor derived its stage list from
 * `pipeline.queues` — work unit definitions, which carry no journey grain. So a stage whose
 * configured metadata DISAGREES with the canonical vocabulary resolved cleanly in the editor and
 * was correctly refused at execution. Same contract, different evidence, opposite answers.
 *
 * The scenario used to be "configured metadata disagrees with the built-in stage vocabulary".
 * That is no longer a contradiction: configuration owns stage grain, and the built-in map is a
 * compatibility fallback consulted only when configuration is silent. The PARITY requirement is
 * unchanged, so the case here is now a genuine contradiction — a stage whose own operating plan
 * and whose configured metadata describe different journeys.
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import { resolveStageGrain, assertStageMoveGrainCompatible } from "@/lib/lifecycle/stageGrainResolution";
import { validateStageOperatingPlanOperatingContract } from "@/lib/lifecycle/validateStageOperatingPlanOperatingContract";
import type { StageOperatingPlanV1 } from "@/lib/lifecycle/stageOperatingPlanV1";

/**
 * A stage that contradicts ITSELF: its configured metadata says child while its own operating plan
 * declares family. Both are configured declarations, so neither can be preferred — this is the
 * contradiction the contract still refuses.
 */
const DECISION_BEFORE = { key: "decision", label: "Decision", grain: "child", journey_segment: "family" };
/** Corrected — the two configured declarations agree. */
const DECISION_AFTER = { key: "decision", label: "Decision", grain: "family", journey_segment: "family" };

describe("Part 1 — the bootstrap carries configured grain", () => {
    const bootstrap = readFileSync(
        resolve(__dirname, "../../lib/lifecycle/buildLifecycleStageBootstrap.ts"),
        "utf8",
    );
    const workspace = readFileSync(
        resolve(__dirname, "../../components/adminV2/settings/lifecycle/LifecycleStageWorkspace.tsx"),
        "utf8",
    );

    it("emits configured_stages with a grain field", () => {
        expect(bootstrap).toContain("configured_stages");
        expect(bootstrap).toContain("grain:");
    });

    it("passes the configured grain through without normalising it", () => {
        // `?? null` — absent stays absent, malformed stays malformed. resolveStageGrain judges.
        expect(bootstrap).toContain('(stage as { grain?: unknown }).grain ?? null');
    });

    it("the editor reads configured_stages, not the grain-less queue lanes", () => {
        expect(workspace).toContain("bootstrap?.configured_stages?.map");
        expect(workspace.indexOf("bootstrap?.configured_stages?.map")).toBeLessThan(
            workspace.indexOf("bootstrap?.pipeline?.queues?.map"),
        );
    });
});

function planMovingTo(target: { key: string }): StageOperatingPlanV1 {
    return {
        version: 1,
        lifecycle_key: "enrollment",
        stage_key: "tour",
        journey_segment: "family",
        work_templates: [],
        outcomes: [{ outcome_key: "chosen", label: "Chosen" }],
        outcome_rules: [
            {
                rule_key: "chosen_move",
                when_outcome_key: "chosen",
                targets: [{ kind: "move_to_stage", transition_ref: "tour_to_decision" }],
            },
        ],
        outgoing_transitions: [
            {
                transition_ref: "tour_to_decision",
                source_stage_key: "tour",
                target_stage_key: target.key,
                label: "Move to Decision",
                available: true,
            },
        ],
        attention_rules: [],
    } as unknown as StageOperatingPlanV1;
}

describe("Part 1 — the editor now sees the contradiction runtime already saw", () => {
    const stagesBefore = [{ key: "tour", label: "Tour", grain: "family" }, DECISION_BEFORE];

    it("runtime resolution reports the contradiction", () => {
        const resolution = resolveStageGrain({
            stageKey: "decision",
            operatingPlanJourneySegment: DECISION_BEFORE.journey_segment,
            configuredMetadataGrain: DECISION_BEFORE.grain,
        });
        expect(resolution.ok).toBe(false);
        expect(resolution.ok === false && resolution.reason).toBe("grain_contradiction");
    });

    it("the editor refuses the same movement, once grain reaches it", () => {
        /**
         * Both surfaces refuse; the CODE differs because their evidence differs. The editor knows
         * the destination's configured metadata (`child`) but not the destination's own operating
         * plan, so it sees a clean child-grain destination and reports a family→child MISMATCH.
         * The runtime, which loads the destination plan too, sees the stage contradict itself.
         * Parity is "both refuse the same movement", not "both emit the same string".
         */
        const issues = validateStageOperatingPlanOperatingContract({
            plan: planMovingTo(DECISION_BEFORE),
            processStages: stagesBefore,
            processStageKeys: stagesBefore.map((s) => s.key),
        });
        expect(
            issues.some(
                (i) =>
                    i.code === "transition_destination_grain_mismatch"
                    || i.code === "transition_destination_grain_unresolved",
            ),
        ).toBe(true);
    });

    it("without grain the editor would have said nothing — which is the defect", () => {
        // Same plan, stage list stripped of grain, as `pipeline.queues` supplied it.
        const grainless = stagesBefore.map(({ key, label }) => ({ key, label }));
        const issues = validateStageOperatingPlanOperatingContract({
            plan: planMovingTo(DECISION_BEFORE),
            processStages: grainless,
            processStageKeys: grainless.map((s) => s.key),
        });
        expect(issues.filter((i) => i.code.includes("grain"))).toEqual([]);
    });

    it("malformed configured grain stays unresolved and blocking", () => {
        for (const grain of ["sideways", "", "  ", 7 as unknown as string]) {
            const resolution = resolveStageGrain({ stageKey: "tenant_stage", configuredMetadataGrain: grain });
            expect(resolution.ok, String(grain)).toBe(false);
        }
    });
});

describe("Part 2 — after the correction", () => {
    const resolution = resolveStageGrain({
        stageKey: "decision",
        operatingPlanJourneySegment: "family",
        configuredMetadataGrain: DECISION_AFTER.grain,
    });

    it("all three sources agree on family", () => {
        expect(resolution.ok && resolution.grain).toBe("family");
        expect(resolution.ok && resolution.opinions.map((o) => o.source).sort()).toEqual([
            "canonical_vocabulary",
            "configured_metadata",
            "operating_plan",
        ]);
    });

    it("a family subject may move onto Decision", () => {
        expect(assertStageMoveGrainCompatible({ subjectGrain: "family", destination: resolution }).ok).toBe(true);
    });

    it("a child subject still may not", () => {
        const blocked = assertStageMoveGrainCompatible({ subjectGrain: "child", destination: resolution });
        expect(blocked.ok).toBe(false);
        if (!blocked.ok) expect(blocked.error.kind).toBe("stage_grain_mismatch");
    });

    it("the editor validator raises no grain issue once corrected", () => {
        const stagesAfter = [{ key: "tour", label: "Tour", grain: "family" }, DECISION_AFTER];
        const issues = validateStageOperatingPlanOperatingContract({
            plan: planMovingTo(DECISION_AFTER),
            processStages: stagesAfter,
            processStageKeys: stagesAfter.map((s) => s.key),
        });
        expect(issues.filter((i) => i.code.includes("grain"))).toEqual([]);
    });

    it("a genuinely incompatible saved path is still preserved and flagged", () => {
        // The correction must not weaken the integrity check it unblocks.
        const stages = [{ key: "tour", label: "Tour", grain: "family" }, { key: "waitlist", label: "Waitlist", grain: "child" }];
        const plan = planMovingTo({ key: "waitlist" });
        const before = JSON.parse(JSON.stringify(plan));
        const issues = validateStageOperatingPlanOperatingContract({
            plan,
            processStages: stages,
            processStageKeys: stages.map((s) => s.key),
        });
        expect(issues.some((i) => i.code === "outcome_movement_grain_mismatch")).toBe(true);
        expect(plan).toEqual(before);
    });
});

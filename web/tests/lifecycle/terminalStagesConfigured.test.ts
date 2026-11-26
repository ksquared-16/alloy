/**
 * A TENANT THAT CHOOSES to represent terminal results as stages — and the platform serving it.
 *
 * Firefly no longer configures `closed` or `closed_withdrawn`: a family case ends through
 * `opportunities.status_key` and a child's participation through `process_instances.state`, and
 * neither needs a stage. These keys are NOT canonical and the platform requires neither.
 *
 * What this file still proves is the other half of that statement — that a tenant who DOES want
 * terminal stages is served correctly. The fixture below is a frozen capture of exactly such a
 * configuration (`certification/sub-slice-3/L-readback.json`), read as one tenant's choice rather
 * than as a required shape: grain resolves from its configured metadata, and movement onto each
 * terminal stage is compatible only with a subject of that stage's own grain.
 *
 * A terminal stage is terminal because it holds no work, not because a flag says so.
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import { assertStageMoveGrainCompatible, resolveStageGrain } from "@/lib/lifecycle/stageGrainResolution";

const draft = JSON.parse(
    readFileSync(resolve(__dirname, "../../../certification/sub-slice-3/L-readback.json"), "utf8"),
) as { config: { processes: Array<{ stages: Array<Record<string, unknown>> }> } };
const stages = draft.config.processes[0]!.stages as Array<{
    key: string;
    label: string;
    grain?: string;
    sort_order: number;
    stage_operating_plan_v1?: {
        work_templates?: unknown[];
        outcomes?: unknown[];
        outgoing_transitions?: unknown[];
    };
}>;
const byKey = (k: string) => stages.find((s) => s.key === k)!;

describe("this tenant's chosen terminal stages resolve from ITS configuration", () => {
    it("carries a family terminal stage under the key this tenant chose", () => {
        expect(byKey("closed")).toBeDefined();
        expect(byKey("closed").label).toBe("Closed");
    });

    it("carries a child terminal stage under the key this tenant chose", () => {
        expect(byKey("closed_withdrawn")).toBeDefined();
        expect(byKey("closed_withdrawn").label).toBe("Closed / Withdrawn");
    });
});

describe("grain resolves from the tenant's configuration", () => {
    it("resolves `closed` as family from CONFIGURED metadata, with the compat map reported but not deciding", () => {
        const stage = byKey("closed");
        expect(stage.grain).toBe("family");
        const r = resolveStageGrain({ stageKey: "closed", configuredMetadataGrain: stage.grain });
        expect(r.ok).toBe(true);
        if (!r.ok) return;
        expect(r.grain).toBe("family");
        // Configured metadata DECIDES; the compatibility map is listed only for transparency.
        expect(r.source).toBe("configured_metadata");
        expect(r.opinions.map((o) => o.source).sort()).toEqual([
            "canonical_vocabulary",
            "configured_metadata",
        ]);
    });

    it("resolves `closed_withdrawn` as child from configured metadata", () => {
        const stage = byKey("closed_withdrawn");
        expect(stage.grain).toBe("child");
        const r = resolveStageGrain({ stageKey: "closed_withdrawn", configuredMetadataGrain: stage.grain });
        expect(r.ok && r.grain).toBe("child");
    });
});

describe("the two tracks cannot cross into each other's terminal", () => {
    const closed = resolveStageGrain({ stageKey: "closed", configuredMetadataGrain: "family" });
    const withdrawn = resolveStageGrain({ stageKey: "closed_withdrawn", configuredMetadataGrain: "child" });

    it("a family subject may reach `closed`", () => {
        expect(assertStageMoveGrainCompatible({ subjectGrain: "family", destination: closed }).ok).toBe(true);
    });

    it("a family subject may NOT reach `closed_withdrawn`", () => {
        const r = assertStageMoveGrainCompatible({ subjectGrain: "family", destination: withdrawn });
        expect(r.ok).toBe(false);
        if (!r.ok) expect(r.error.kind).toBe("stage_grain_mismatch");
    });

    it("a child subject may reach `closed_withdrawn`", () => {
        expect(assertStageMoveGrainCompatible({ subjectGrain: "child", destination: withdrawn }).ok).toBe(true);
    });

    it("a child subject may NOT reach `closed`", () => {
        const r = assertStageMoveGrainCompatible({ subjectGrain: "child", destination: closed });
        expect(r.ok).toBe(false);
        if (!r.ok) expect(r.error.kind).toBe("stage_grain_mismatch");
    });
});

describe("terminal means no work — proven by absence, not by a flag", () => {
    for (const key of ["closed", "closed_withdrawn"]) {
        it(`${key} has no operating plan at all`, () => {
            // No plan means no work templates, no outcomes, no rules and no transitions. Nothing
            // can provision Current Work from a stage that declares no work to do.
            expect(byKey(key).stage_operating_plan_v1).toBeUndefined();
        });

        it(`${key} therefore has zero work templates and zero outcomes`, () => {
            const plan = byKey(key).stage_operating_plan_v1;
            expect(plan?.work_templates ?? []).toHaveLength(0);
            expect(plan?.outcomes ?? []).toHaveLength(0);
        });

        it(`${key} has no ordinary outgoing transitions`, () => {
            expect(byKey(key).stage_operating_plan_v1?.outgoing_transitions ?? []).toHaveLength(0);
        });
    }

    it("no outcome anywhere targets either terminal yet", () => {
        // This slice configures the stages; wiring Closed Lost is separately certified.
        const refs: string[] = [];
        for (const s of stages) {
            for (const t of s.stage_operating_plan_v1?.outgoing_transitions ?? []) {
                refs.push((t as { target_stage_key: string }).target_stage_key);
            }
        }
        expect(refs).not.toContain("closed");
        expect(refs).not.toContain("closed_withdrawn");
    });
});

describe("existing configuration was not disturbed", () => {
    it("keeps the prior six stages and their order", () => {
        expect(stages.map((s) => s.key)).toEqual([
            "lead",
            "tour",
            "decision",
            "waitlist",
            "enrolling",
            "enrolled",
            "closed",
            "closed_withdrawn",
        ]);
    });

    it("appends without renumbering the stages that were already there", () => {
        expect(stages.map((s) => s.sort_order)).toEqual([0, 2, 3, 4, 6, 7, 8, 9]);
    });
});

/**
 * Firefly's PUBLISHED-CANDIDATE draft, asserted against the corrected model.
 *
 * Reads the captured revision-19 read-back — the exact payload the publication step will publish.
 * This is Firefly's configuration, not platform doctrine: what it proves is that the tenant's
 * chosen six stages are internally coherent and that nothing in them depends on a terminal stage.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { resolveStageGrain } from "@/lib/lifecycle/stageGrainResolution";

const draft = JSON.parse(
    readFileSync(resolve(__dirname, "../../../certification/publication/rev19-draft.json"), "utf8"),
) as { processes: Array<Record<string, unknown>> };

type TargetRow = { kind: string; stage_key?: string; disposition_key?: string };
type DecisionRow = {
    decision_key: string;
    targets: TargetRow[];
    required_inputs?: Array<{ key: string; required: boolean; binds_to_target_field?: string }>;
};
type WorkTemplateRow = { participant_decisions: DecisionRow[]; family_close?: unknown };
type TransitionRow = { source_stage_key: string; target_stage_key: string };
type StageRow = {
    key: string;
    label: string;
    grain?: string;
    sort_order: number;
    stage_operating_plan_v1?: {
        work_templates?: WorkTemplateRow[];
        outgoing_transitions?: TransitionRow[];
    };
};

const proc = draft.processes[0] as {
    stages: StageRow[];
    command_set_v1: { commands: Array<{ capability_key: string; enabled: boolean }> };
};
const byKey = (k: string) => proc.stages.find((s) => s.key === k);

describe("Firefly revision 19 — the six configured stages", () => {
    it("has exactly six stages, in the tenant's chosen order", () => {
        expect(proc.stages.map((s) => s.key)).toEqual([
            "lead", "tour", "decision", "waitlist", "enrolling", "enrolled",
        ]);
    });

    it("configures no terminal stage under either removed key", () => {
        expect(byKey("closed")).toBeUndefined();
        expect(byKey("closed_withdrawn")).toBeUndefined();
    });

    it("resolves every stage's grain from ITS OWN configured metadata", () => {
        const expected: Record<string, "family" | "child"> = {
            lead: "family", tour: "family", decision: "family",
            waitlist: "child", enrolling: "child", enrolled: "child",
        };
        for (const stage of proc.stages) {
            const r = resolveStageGrain({ stageKey: stage.key, configuredMetadataGrain: stage.grain });
            expect(r.ok, stage.key).toBe(true);
            if (!r.ok) continue;
            expect(r.grain, stage.key).toBe(expected[stage.key]);
            expect(r.source, stage.key).toBe("configured_metadata");
        }
    });

    it("leaves no stage reference dangling", () => {
        const keys = new Set(proc.stages.map((s) => s.key));
        const blob = JSON.stringify(draft);
        const refs = [...blob.matchAll(/"(?:stage_key|target_stage_key|source_stage_key)"\s*:\s*"([^"]+)"/g)]
            .map((m) => m[1]!);
        expect([...new Set(refs)].filter((r) => !keys.has(r))).toEqual([]);
    });

    it("keeps the three progression paths the tenant configured", () => {
        const transitions = proc.stages.flatMap((s) => s.stage_operating_plan_v1?.outgoing_transitions ?? []);
        const has = (from: string, to: string) =>
            transitions.some((t) => t.source_stage_key === from && t.target_stage_key === to);
        expect(has("lead", "tour")).toBe(true);
        expect(has("tour", "decision")).toBe(true);
        expect(has("enrolling", "enrolled")).toBe(true);
    });
});

describe("Firefly revision 19 — Not Enrolling needs no terminal stage", () => {
    const tpl = byKey("decision")!.stage_operating_plan_v1!.work_templates![0]!;
    const ne = tpl.participant_decisions.find((p) => p.decision_key === "child_not_enrolling")!;

    it("sets durable child state and requires a reason", () => {
        expect(ne.targets).toEqual([
            { kind: "update_child_enrollment_status", disposition_key: "not_enrolling" },
        ]);
        expect(ne.required_inputs?.some((i) => i.key === "close_reason_key" && i.required)).toBe(true);
        expect(ne.required_inputs?.[0]?.binds_to_target_field).toBe("close_reason_key");
    });

    it("configures NO stage movement at all", () => {
        expect(ne.targets.some((t) => t.kind === "move_to_stage")).toBe(false);
    });

    it("leaves Waitlist and Begin Enrolling moving as before", () => {
        const byDecision = (k: string) => tpl.participant_decisions.find((p) => p.decision_key === k)!;
        expect(byDecision("child_waitlist").targets).toContainEqual({ kind: "move_to_stage", stage_key: "waitlist" });
        expect(byDecision("child_begin_enrolling").targets).toContainEqual({ kind: "move_to_stage", stage_key: "enrolling" });
    });

    it("does not install governed family close", () => {
        expect(tpl.family_close).toBeUndefined();
    });

    it("keeps Decision at family grain", () => {
        expect(byKey("decision")!.grain).toBe("family");
    });

    it("keeps the three child capabilities enabled in the command set", () => {
        const enabled = proc.command_set_v1.commands.filter((c) => c.enabled).map((c) => c.capability_key);
        for (const k of ["waitlist_child", "enroll_child", "update_child_enrollment_status"]) {
            expect(enabled).toContain(k);
        }
    });
});

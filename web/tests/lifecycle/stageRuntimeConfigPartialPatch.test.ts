/**
 * Editing an operating plan must not require, or rewrite, queue membership.
 *
 * `stage-runtime-config` hard-required a non-empty `selected_status_keys` on EVERY save. That made
 * a disposition-keyed child stage unauthorable: Firefly's `enrolling` scopes its queue by
 * `included_disposition_keys: ["qualified"]` and has no status keys at all, so repointing one
 * outcome rule was impossible without inventing membership the stage does not use — and those
 * invented keys are threaded into the work-unit save, so the workaround would have rewritten the
 * queue definition.
 *
 * Omitted now means "leave membership exactly as configured". Supplied still means "this IS the
 * membership".
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const route = readFileSync(
    resolve(__dirname, "../../app/api/admin/enrollment-process/stage-runtime-config/route.ts"),
    "utf8",
);
const service = readFileSync(
    resolve(__dirname, "../../lib/lifecycle/saveLifecycleStageRuntimeConfig.ts"),
    "utf8",
);

describe("the route no longer demands membership for every save", () => {
    it("does not reject a save that omits selected_status_keys", () => {
        expect(route).not.toContain('error: "selected_status_keys is required"');
    });

    it("distinguishes omitted from explicitly empty", () => {
        // Omitted = leave alone. Explicit [] = an intent to clear, which is refused rather than
        // silently ignored.
        expect(route).toContain("statusKeysSupplied");
        expect(route).toContain("omit the field to leave membership unchanged");
    });

    it("passes the keys through only when the caller supplied them", () => {
        expect(route).toContain("...(statusKeysSupplied ? { selectedStatusKeys } : {})");
    });
});

describe("the service resolves membership rather than demanding it", () => {
    it("treats selectedStatusKeys as optional", () => {
        expect(service).toContain("selectedStatusKeys?: readonly string[]");
    });

    it("still validates keys when a membership edit IS requested", () => {
        expect(service).toContain("if (input.selectedStatusKeys !== undefined) {");
        expect(service).toContain("requireLifecycleStageQueueStatusKeys");
    });

    it("reads existing membership back when the caller omitted it", () => {
        expect(service).toContain("membershipStatusKeys");
        expect(service).toContain("effectiveLifecycleStageStatusKeys(stageKey, membershipStatusKeys)");
    });

    it("never translates disposition membership into status membership", () => {
        // The read-back looks at `included_status_keys` only. A disposition-keyed stage resolves to
        // [] and keeps its dispositions — it does not get status keys synthesised from them.
        expect(service).toContain("included_status_keys");
        expect(service).not.toContain("included_disposition_keys.map");
    });

    it("keeps membership resolution on the existing preserve-by-default helper", () => {
        // `resolveEffectiveStageMembership(explicit=null)` already preserved the stored membership;
        // this change did not add a second path that could clear it.
        expect(service).toContain("resolveEffectiveStageMembership({");
        expect(service).toContain("stageMembership: stageRecord.queue_membership_v1");
    });

    it("still goes through the draft service, CAS and audit path", () => {
        expect(service).toContain("openDraft");
        expect(service).toContain("saveDraft");
        expect(service).toContain("expectedDraftRevision");
    });
});

describe("Firefly's enrolling stage — the case this unblocked", () => {
    const evidence = JSON.parse(
        readFileSync(
            resolve(__dirname, "../../../certification/sub-slice-3/F-readback.json"),
            "utf8",
        ),
    ) as { config: { processes: Array<{ stages: Array<Record<string, unknown>> }> } };
    const stage = evidence.config.processes[0]!.stages.find((s) => s.key === "enrolling")! as {
        grain: string;
        queue_membership_v1: { included_disposition_keys: string[]; included_status_keys?: string[] };
        stage_operating_plan_v1: {
            outgoing_transitions: Array<{ transition_ref: string; target_stage_key: string }>;
            outcome_rules: Array<{ rule_key: string; targets: Array<Record<string, unknown>> }>;
        };
    };

    it("kept its disposition membership byte-identical", () => {
        expect(stage.queue_membership_v1.included_disposition_keys).toEqual(["qualified"]);
    });

    it("had no status keys invented for it", () => {
        expect(stage.queue_membership_v1.included_status_keys).toBeUndefined();
    });

    it("has exactly one enrolling_to_enrolled transition, to enrolled", () => {
        const t = stage.stage_operating_plan_v1.outgoing_transitions.filter(
            (x) => x.transition_ref === "enrolling_to_enrolled",
        );
        expect(t).toHaveLength(1);
        expect(t[0]!.target_stage_key).toBe("enrolled");
    });

    it("moves Enrollment Complete through the transition, not a raw stage key", () => {
        const rule = stage.stage_operating_plan_v1.outcome_rules.find(
            (r) => r.rule_key === "complete_to_enrolled",
        )!;
        const move = rule.targets.find((t) => t.kind === "move_to_stage")!;
        expect(move.transition_ref).toBe("enrolling_to_enrolled");
        expect(move.stage_key).toBeUndefined();
    });

    it("remains child grain", () => {
        expect(stage.grain).toBe("child");
    });
});

/**
 * DECLARABLE ROW GRAIN — a stage-independent lens can say what its rows ARE.
 *
 * Derivation ("the grain of the stages this lens filters on") is authoritative for a stage-scoped lens
 * and is unchanged. It cannot serve a lens that has no stage predicate ON PURPOSE: it reads "no
 * predicate" as "every active stage", and Firefly's process has 2 family + 4 child active stages, so a
 * perfectly coherent "All Children in Enrollment" resolved two grains and refused itself — a second dead
 * destination, arrived at by asking the lens a question it was not built to answer.
 *
 * G-1 ("a surface cannot be grain-ambiguous") is NOT relaxed. A declared lens is unambiguous BY
 * DECLARATION; an undeclared ambiguous lens still refuses; and a declaration that contradicts the lens's
 * own stage predicate refuses too, because that is a configuration lie and honouring it would reintroduce
 * wrong-subject substitution from the other direction.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { parseWorkViewRow, type WorkViewConfigV1Stored } from "@/lib/lifecycle/workViewsConfigV1";
import type { LifecycleBuilderStageRecord } from "@/lib/lifecycle/lifecycleBuilderConfig";
import { stageKeysReferencedByWorkView } from "@/lib/lifecycle/stageGrainV1";
import { lensStageKeys, resolveLensRowGrain } from "@/lib/runtime/provisioning/workUnitProvisioningAnswer";

const stage = (key: string, grain: "family" | "child"): LifecycleBuilderStageRecord => ({
    id: `st-${key}`,
    key,
    label: key,
    sort_order: 1,
    is_active: true,
    grain,
});

/** Firefly's shape: two family stages, four child stages, all active. */
const STAGES: LifecycleBuilderStageRecord[] = [
    stage("lead", "family"),
    stage("tour", "family"),
    stage("decision", "child"),
    stage("waitlist", "child"),
    stage("enrolling", "child"),
    stage("enrolled", "child"),
];

const view = (v: Partial<WorkViewConfigV1Stored>): WorkViewConfigV1Stored => ({
    id: "v",
    label: "A lens",
    ...v,
});

const stageFilter = (...keys: string[]) => [
    { field_key: "opportunity_stage", operator: "is_any_of" as const, value: keys },
];

describe("derivation is unchanged for a stage-scoped lens", () => {
    it("one grain across the filtered stages resolves to that grain", () => {
        expect(resolveLensRowGrain(view({ filters_v1: stageFilter("lead", "tour") }), STAGES)).toEqual({
            ok: true,
            grain: "family",
        });
        expect(resolveLensRowGrain(view({ filters_v1: stageFilter("waitlist") }), STAGES)).toEqual({
            ok: true,
            grain: "child",
        });
    });

    it("G-1 holds: an UNDECLARED lens spanning both grains still refuses", () => {
        const r = resolveLensRowGrain(view({ filters_v1: stageFilter("lead", "waitlist") }), STAGES);
        expect(r.ok).toBe(false);
        if (!r.ok) expect(r.reason).toMatch(/grain-ambiguous/);
    });

    it("an UNDECLARED stage-independent lens still refuses — that is the blocking fact this fixes", () => {
        const r = resolveLensRowGrain(view({}), STAGES);
        expect(r.ok).toBe(false);
        if (!r.ok) expect(r.reason).toMatch(/grain-ambiguous/);
    });
});

describe("a declaration resolves what derivation cannot", () => {
    it("'All Children in Enrollment' — no stage predicate, declared child — resolves", () => {
        const allChildren = view({ id: "all_children_in_enrollment", row_grain_v1: "child" });
        expect(lensStageKeys(allChildren)).toEqual([]); // genuinely stage-independent
        expect(resolveLensRowGrain(allChildren, STAGES)).toEqual({ ok: true, grain: "child" });
    });

    it("a declaration agreeing with the lens's stages is honoured", () => {
        expect(
            resolveLensRowGrain(view({ filters_v1: stageFilter("waitlist"), row_grain_v1: "child" }), STAGES),
        ).toEqual({ ok: true, grain: "child" });
    });

    it("a declaration CONTRADICTING the lens's stages is refused — a lie, not an override", () => {
        const r = resolveLensRowGrain(
            view({ filters_v1: stageFilter("lead", "tour"), row_grain_v1: "child" }),
            STAGES,
        );
        expect(r.ok).toBe(false);
        if (!r.ok) expect(r.reason).toMatch(/contradicts the lens/);
    });

    it("declaring a grain the panel cannot present is still refused downstream, not here", () => {
        // resolveLensRowGrain answers "what grain"; resolveSubjectGrain answers "can this be presented".
        // Keeping them separate is why `person` gets `grain_unsupported` rather than a grain error.
        expect(resolveLensRowGrain(view({ row_grain_v1: "person" }), STAGES)).toEqual({
            ok: true,
            grain: "person",
        });
    });
});

describe("the runtime and the builder read the stage predicate the same way", () => {
    it("an empty stage value does not make a lens look stage-scoped", () => {
        // The builder decides whether to offer a Row Type declaration by asking whether the view
        // references any stage. If the runtime answered that question differently, a view could show
        // a declaration field while being resolved as scoped to a stage key of "".
        const blank = view({ filters_v1: [{ field_key: "opportunity_stage", operator: "equals", value: "" }] });
        expect(lensStageKeys(blank)).toEqual([]);
        expect(stageKeysReferencedByWorkView(blank.filters_v1)).toEqual([]);
    });

    it("they agree on a real stage set, whitespace and all", () => {
        const padded = view({
            filters_v1: [{ field_key: "opportunity_stage", operator: "is_any_of", value: [" waitlist ", "enrolling"] }],
        });
        expect(lensStageKeys(padded)).toEqual(["waitlist", "enrolling"]);
        expect(stageKeysReferencedByWorkView(padded.filters_v1).sort()).toEqual(
            [...lensStageKeys(padded)].sort(),
        );
    });
});

describe("the declaration survives configuration load", () => {
    it("a valid declared grain is parsed and persisted", () => {
        const parsed = parseWorkViewRow({ id: "all_children", label: "All Children", row_grain_v1: "child" });
        expect(parsed?.row_grain_v1).toBe("child");
    });

    it("an unrecognized grain is DROPPED, not carried forward as something nothing can resolve", () => {
        const parsed = parseWorkViewRow({ id: "x", label: "X", row_grain_v1: "toddler" });
        expect(parsed?.row_grain_v1).toBeUndefined();
    });

    it("a lens with no declaration keeps deriving — the field is additive", () => {
        const parsed = parseWorkViewRow({ id: "new_leads", label: "New Leads" });
        expect(parsed?.row_grain_v1).toBeUndefined();
    });
});

describe("membership follows the lens's shape, not a stage enumeration", () => {
    const ANSWER = readFileSync(
        join(process.cwd(), "lib/runtime/provisioning/workUnitProvisioningAnswer.ts"),
        "utf8",
    );

    it("a stage-independent child lens asks for PARTICIPATION membership", () => {
        // The rule moved OUT of the answer so the COUNT path could obey the same one — while it was
        // inline, the totals route counted the opportunity lane instead (13 rows under a pill of 8).
        // Same invariant, one home.
        const membership = readFileSync(
            join(process.cwd(), "lib/runtime/provisioning/childGrainMembership.ts"),
            "utf8",
        );
        expect(membership).toContain('mode: "participation"');
        expect(membership).toContain('mode: "stages"');

        // …and the answer reaches it rather than keeping a second copy.
        const branch = ANSWER.slice(ANSWER.indexOf('if (subjectGrain.grain === "child")'));
        expect(branch).toContain("loadChildGrainMembersForLens");
        expect(branch).not.toContain('mode: "participation"');
    });

    it("the child row source never re-derives membership from the opportunity lens", () => {
        const src = readFileSync(
            join(process.cwd(), "lib/runtime/provisioning/childGrainProvisioningRows.ts"),
            "utf8",
        );
        expect(src).not.toContain("computeOperationalProjection");
        // Liveness is the Business Process's ratified gate, consumed — never restated here.
        expect(src).not.toContain("close_reason_key");
    });
});

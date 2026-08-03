/**
 * 3B — CANONICAL GRAIN TRANSLATION.
 *
 * Three vocabularies for one idea, none aligned by name: StageGrain (stage config) ·
 * journey_segment (operating plans) · OperationalGrain (Focus Panel).
 *
 * The `?? "family"` literals scattered across the write path turned out to be DEAD, not dangerous:
 * `journey_segment` is required on the type and enforced by `parseStageOperatingPlanV1`, so a plan
 * that omits it never parses and never reaches a call site. Removing them is hygiene.
 *
 * The live defect is the one nothing was looking at: the plan's segment and the STAGE's grain are
 * two independent declarations, and no code reconciled them. A stage configured `grain: "child"`
 * whose plan still said `family` ran as a family — `completeStageWorkWithOutcome`'s child guard
 * reads the PLAN, so it never fired, no child subject was demanded, and the outcome executed against
 * the family case. Reachable whenever a tenant edits grain in the builder without republishing the
 * plan. It is now refused.
 *
 * Second live case: where there is no plan at all (`reportExternalContact` reads `plan?.`), the
 * segment now derives from the stage's grain instead of defaulting to family.
 */

import { describe, expect, it } from "vitest";
import {
    journeySegmentForStageGrain,
    journeySegmentOrFamily,
    resolveJourneySegment,
} from "@/lib/lifecycle/grainVocabulary";
import { projectStageWorkRuntimeSync } from "@/lib/lifecycle/projectStageWorkRuntime";
import { LIFECYCLE_BUILDER_METADATA_KEY } from "@/lib/lifecycle/lifecycleBuilderConfig";

describe("StageGrain → journey segment", () => {
    it("family and child translate", () => {
        expect(journeySegmentForStageGrain("family")).toEqual({ ok: true, segment: "family" });
        expect(journeySegmentForStageGrain("child")).toEqual({ ok: true, segment: "child" });
    });

    it("grains with no plan vocabulary REFUSE rather than answering 'family'", () => {
        for (const grain of ["person", "account", "work_item"] as const) {
            const r = journeySegmentForStageGrain(grain);
            expect(r.ok).toBe(false);
            if (!r.ok) expect(r.reason).toContain(grain);
        }
    });
});

describe("reconciling the two places the segment is declared", () => {
    it("a child stage whose plan is silent is a CHILD stage — this is the defect", () => {
        expect(resolveJourneySegment({ stageGrain: "child" })).toEqual({
            ok: true,
            segment: "child",
            source: "stage_grain",
        });
    });

    it("agreement resolves to the declaration", () => {
        expect(resolveJourneySegment({ planSegment: "child", stageGrain: "child" })).toEqual({
            ok: true,
            segment: "child",
            source: "declared",
        });
    });

    it("a contradiction is REFUSED, not settled by precedence", () => {
        const r = resolveJourneySegment({ planSegment: "family", stageGrain: "child" });
        expect(r.ok).toBe(false);
        if (!r.ok) expect(r.reason).toMatch(/contradicts itself/);
    });

    it("a plan authored for a stage grain that has no segment is a contradiction too", () => {
        const r = resolveJourneySegment({ planSegment: "child", stageGrain: "person" });
        expect(r.ok).toBe(false);
    });

    it("with nothing declared the answer is family, but MARKED as a default", () => {
        expect(resolveJourneySegment({})).toEqual({ ok: true, segment: "family", source: "default" });
    });

    it("a plan alone still speaks for itself when the stage declares no grain", () => {
        expect(resolveJourneySegment({ planSegment: "child" })).toEqual({
            ok: true,
            segment: "child",
            source: "declared",
        });
    });

    it("the tolerant helper keeps the fallback NAMED — and still derives before defaulting", () => {
        expect(journeySegmentOrFamily({ stageGrain: "child" })).toBe("child");
        expect(journeySegmentOrFamily({})).toBe("family");
        expect(journeySegmentOrFamily({ planSegment: "family", stageGrain: "child" })).toBe("family");
    });
});

// ── The projection reads the reconciled segment, not the plan's default ──────────────────────────

const metadataFor = (stage: Record<string, unknown>) => ({
    [LIFECYCLE_BUILDER_METADATA_KEY]: {
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
                        id: "s-custom",
                        key: "custom_review",
                        label: "Custom Review",
                        sort_order: 0,
                        is_active: true,
                        ...stage,
                    },
                ],
            },
        ],
    },
});

// A plan MUST declare `journey_segment` — `parseStageOperatingPlanV1` rejects one that omits it, so
// a plan with no segment never reaches a call site at all. That is why the `?? "family"` literals
// this change removed were dead rather than dangerous. The live defect is the other one: the plan's
// segment and the STAGE's grain are two independent declarations, and nothing reconciled them, so a
// stage configured `grain: "child"` whose plan still said `family` ran as a family — the exact
// wrong-subject write, reachable whenever a tenant edits grain in the builder without republishing
// the plan.
const planFor = (segment: "family" | "child") => ({
    version: 1,
    journey_segment: segment,
    lifecycle_key: "enrollment",
    stage_key: "custom_review",
    work_templates: [
        {
            template_key: "custom_review_step",
            label: "Custom review step",
            required: true,
            primary: true,
            due_policy: { kind: "same_day" },
            owner_strategy: "record_owner",
            work_definition_key: "contact_family",
        },
    ],
    outcomes: [{ outcome_key: "reviewed", label: "Reviewed" }],
    outcome_rules: [],
});

const project = (stage: Record<string, unknown>) =>
    projectStageWorkRuntimeSync({
        orgId: "org-1",
        opportunityId: "opp-1",
        departmentId: "dept-1",
        departmentMetadata: metadataFor(stage),
        builderStageKey: "custom_review",
    } as never);

describe("stage work runtime reconciles the plan's segment with the stage's grain", () => {
    it("a stage whose grain CONTRADICTS its plan projects NOTHING", () => {
        // Previously the plan simply won and this ran as a family — on a stage the tenant had
        // configured as child-grain. There is no correct surface to render for a configuration that
        // disagrees with itself, and picking one of the two declarations is the silent default again.
        const p = project({ grain: "child", stage_operating_plan_v1: planFor("family") });
        expect(p).toBeNull();
    });

    it("agreement projects normally", () => {
        const child = project({ grain: "child", stage_operating_plan_v1: planFor("child") });
        expect(child?.journey_segment).toBe("child");
        // No child was named, so the subject says it is not executable rather than offering an
        // action that dies at the outcome guard.
        expect(child?.execution.subject_unresolved).toBe("child_identity_required");

        const family = project({ grain: "family", stage_operating_plan_v1: planFor("family") });
        expect(family?.journey_segment).toBe("family");
        expect(family?.execution.subject_unresolved).toBeUndefined();
    });

    it("a stage that declares no grain leaves the plan speaking for itself", () => {
        expect(project({ stage_operating_plan_v1: planFor("child") })?.journey_segment).toBe("child");
        expect(project({ stage_operating_plan_v1: planFor("family") })?.journey_segment).toBe("family");
    });
});

/**
 * 3C — grain-aware scope resolution.
 *
 * The collision: `resolveFocusPanelScope` classifies a subject by running the lens's predicates over
 * it, and those predicates are opportunity-shaped. A CHILD row has none of those fields, so it
 * matches nothing — and "matches nothing" is reported to the operator as "this record has moved out
 * of your lens", with a destination lens chosen by the same broken comparison. Confident, navigable,
 * fabricated.
 *
 * Unreachable today only because `subject_surface_unavailable` refuses first. That refusal is
 * scaffolding and comes out in Phase 4; this is what has to exist before it does.
 */

import { describe, expect, it } from "vitest";
import {
    childMatchesLens,
    resolveChildGrainFocusPanelScope,
    type ChildScopeLensReader,
} from "@/lib/runtime/provisioning/childGrainScope";
import { resolveFocusPanelScope } from "@/lib/lifecycle/operationalProjection";
import { lensStageKeys, resolveLensRowGrain } from "@/lib/runtime/provisioning/workUnitProvisioningAnswer";
import type { LifecycleBuilderStageRecord } from "@/lib/lifecycle/lifecycleBuilderConfig";
import type { WorkViewConfigV1Stored } from "@/lib/lifecycle/workViewsConfigV1";

const stage = (key: string, grain: "family" | "child"): LifecycleBuilderStageRecord => ({
    id: `st-${key}`,
    key,
    label: key,
    sort_order: 1,
    is_active: true,
    grain,
});

const STAGES = [
    stage("lead", "family"),
    stage("tour", "family"),
    stage("waitlist", "child"),
    stage("enrolling", "child"),
    stage("enrolled", "child"),
];

const stageFilter = (...keys: string[]) => [
    { field_key: "opportunity_stage", operator: "is_any_of" as const, value: keys },
];

const NEW_LEADS: WorkViewConfigV1Stored = { id: "new_leads", label: "New Leads", filters_v1: stageFilter("lead") };
const WAITLIST: WorkViewConfigV1Stored = { id: "waitlist", label: "Waitlist", filters_v1: stageFilter("waitlist") };
const REGISTRATION: WorkViewConfigV1Stored = {
    id: "registration",
    label: "Registration",
    filters_v1: stageFilter("enrolling", "enrolled"),
};
const ALL_CHILDREN: WorkViewConfigV1Stored = {
    id: "all_children",
    label: "All Children in Enrollment",
    row_grain_v1: "child",
};

const ALL_VIEWS = [NEW_LEADS, WAITLIST, REGISTRATION, ALL_CHILDREN];

// The real readers, wired the way the answer will wire them.
const reader: ChildScopeLensReader = {
    stageKeysForView: (view) => lensStageKeys(view),
    isChildLens: (view) => {
        const grain = resolveLensRowGrain(view, STAGES);
        return grain.ok && grain.grain === "child";
    },
};

describe("child membership restates the provider's rule, not an opportunity predicate", () => {
    it("a stage-scoped child lens admits by EFFECTIVE stage", () => {
        expect(childMatchesLens({ stageKey: "waitlist" }, WAITLIST, reader)).toBe(true);
        expect(childMatchesLens({ stageKey: "enrolling" }, WAITLIST, reader)).toBe(false);
        expect(childMatchesLens({ stageKey: "enrolling" }, REGISTRATION, reader)).toBe(true);
    });

    it("a stage-independent child lens admits any child that reached the answer", () => {
        expect(childMatchesLens({ stageKey: "lead" }, ALL_CHILDREN, reader)).toBe(true);
        expect(childMatchesLens({ stageKey: null }, ALL_CHILDREN, reader)).toBe(true);
    });

    it("a child with no effective stage is not claimed by a stage-scoped lens", () => {
        expect(childMatchesLens({ stageKey: null }, WAITLIST, reader)).toBe(false);
    });
});

describe("scope for a child subject", () => {
    it("a child in its own lens is IN SCOPE", () => {
        const s = resolveChildGrainFocusPanelScope({
            subject: { stageKey: "waitlist" },
            activeView: WAITLIST,
            workViews: ALL_VIEWS,
            reader,
        });
        expect(s.kind).toBe("in_scope");
    });

    it("a child that moved is offered a CHILD destination, never a family lens", () => {
        const s = resolveChildGrainFocusPanelScope({
            subject: { stageKey: "enrolling" },
            activeView: WAITLIST,
            workViews: ALL_VIEWS,
            reader,
        });
        expect(s.kind).toBe("out_of_scope");
        if (s.kind !== "out_of_scope") return;
        expect(s.destinationViewId).toBe("registration");
    });

    it("New Leads is never a destination for a child — a family lens is not a place a child can be", () => {
        const s = resolveChildGrainFocusPanelScope({
            // A child riding its family's `lead` stage: the ONE case where a family lens would
            // otherwise look like a match, because the stage key is the same string.
            subject: { stageKey: "lead" },
            activeView: WAITLIST,
            workViews: ALL_VIEWS,
            reader,
        });
        expect(s.kind).toBe("out_of_scope");
        if (s.kind !== "out_of_scope") return;
        expect(s.destinationViewId).not.toBe("new_leads");
        // The stage-independent child lens holds every live child, so that is where it goes.
        expect(s.destinationViewId).toBe("all_children");
    });

    it("a subject that has not loaded is never asserted out of scope", () => {
        const s = resolveChildGrainFocusPanelScope({
            subject: null,
            activeView: WAITLIST,
            workViews: ALL_VIEWS,
            reader,
        });
        expect(s.kind).toBe("in_scope");
    });

    it("no active lens is its own state, not an out-of-scope claim", () => {
        const s = resolveChildGrainFocusPanelScope({
            subject: { stageKey: "waitlist" },
            activeView: null,
            workViews: ALL_VIEWS,
            reader,
        });
        expect(s.kind).toBe("no_active_view");
    });

    it("a grain-unresolvable lens is excluded rather than assumed", () => {
        const ambiguous: WorkViewConfigV1Stored = {
            id: "all_work",
            label: "All Work",
            filters_v1: stageFilter("lead", "waitlist"),
        };
        expect(reader.isChildLens(ambiguous)).toBe(false);
        const s = resolveChildGrainFocusPanelScope({
            subject: { stageKey: "enrolling" },
            activeView: WAITLIST,
            workViews: [WAITLIST, ambiguous],
            reader,
        });
        expect(s.kind).toBe("out_of_scope");
        if (s.kind !== "out_of_scope") return;
        expect(s.destinationViewId).toBeNull();
    });
});

describe("the family path is unchanged", () => {
    const familyRow = { id: "opp-1", stage_key: "lead" } as never;

    it("a family record still classifies through the opportunity predicates", () => {
        expect(
            resolveFocusPanelScope({ record: familyRow, activeView: NEW_LEADS, workViews: ALL_VIEWS }).kind,
        ).toBe("in_scope");
    });

    it("a family record out of its lens still names a destination", () => {
        const s = resolveFocusPanelScope({ record: familyRow, activeView: WAITLIST, workViews: ALL_VIEWS });
        expect(s.kind).toBe("out_of_scope");
        if (s.kind !== "out_of_scope") return;
        expect(s.destinationViewId).toBe("new_leads");
    });
});

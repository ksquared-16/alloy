/**
 * PHASE 4 — the child Runtime ViewModel is COMPOSITION ONLY.
 *
 * These proofs are about what the module REFUSES to invent, not about what it returns. The defect
 * class they guard is the one the removed `subject_surface_unavailable` refusal was standing in for:
 * a child surface that populates from the family's configuration and therefore looks like success.
 */
import { describe, expect, it } from "vitest";
import {
    composeChildGrainSurface,
    childSubjectIdentityTruthBindings,
} from "@/lib/runtime/provisioning/childGrainSurfaceComposition";
import type { LifecycleBuilderStageRecord } from "@/lib/lifecycle/lifecycleBuilderConfig";
import type { ChildProvisioningRow } from "@/lib/runtime/provisioning/childGrainProvisioningRows";

function stage(over: Partial<LifecycleBuilderStageRecord> & { key: string }): LifecycleBuilderStageRecord {
    return {
        id: `stage-${over.key}`,
        label: over.key,
        sort_order: 1,
        is_active: true,
        ...over,
    } as LifecycleBuilderStageRecord;
}

/** Firefly's real shape: `lead` is family-grain with a family plan that DOES configure work. */
const LEAD = stage({
    key: "lead",
    label: "Lead",
    grain: "family",
    stage_operating_plan_v1: {
        journey_segment: "family",
        purpose: "Qualify the family",
        work_templates: [
            {
                template_key: "family_intake",
                label: "Complete intake",
                required: true,
                primary: true,
                primary_action: { action_ref: "record_outcome" },
            },
        ],
    } as never,
});

/** A child-grain stage that configures NO action — Firefly's decision/waitlist/enrolling/enrolled. */
const WAITLIST = stage({
    key: "waitlist",
    label: "Waitlist",
    grain: "child",
    stage_operating_plan_v1: { journey_segment: "child", purpose: "Hold the child" } as never,
});

/** A child-grain stage that DOES configure child work with an action. */
const ENROLLING = stage({
    key: "enrolling",
    label: "Enrolling",
    grain: "child",
    stage_operating_plan_v1: {
        journey_segment: "child",
        purpose: "Finish enrolment",
        work_templates: [
            {
                template_key: "child_agreement",
                label: "Sign agreement",
                required: true,
                primary: true,
                primary_action: { action_ref: "child_record_outcome", override_label: "Record decision" },
            },
        ],
    } as never,
});

const STAGES = [LEAD, WAITLIST, ENROLLING];

function childRow(over: Partial<ChildProvisioningRow> = {}): ChildProvisioningRow {
    return {
        subjectId: "cm-1",
        participationId: "pi-1",
        contextId: "opp-1",
        familyCustomerId: null,
        legacyOcmId: null,
        stageKey: "lead",
        statusKey: null,
        title: "Wrigley Kurzman",
        updatedAt: null,
        ...over,
    };
}

describe("child Runtime ViewModel — composition only", () => {
    it("a child at a FAMILY-segment stage owns no work there, and says so", () => {
        // The live Firefly case: every child participation carries stage_key = NULL, so the effective
        // stage is the family's `lead`. That stage configures work — for the FAMILY.
        const r = composeChildGrainSurface({ row: childRow({ stageKey: "lead" }), stages: STAGES });
        expect(r.ok).toBe(true);
        if (!r.ok) return;

        expect(r.composition.segment).toBe("family");
        expect(r.composition.childOwnsStageWork).toBe(false);

        // THE POINT: `lead` has a primary work template with a real action_ref. It must not surface.
        expect(r.composition.primaryAction).toBeNull();
        expect(r.composition.primaryActionAbsence).toBe("stage_is_family_segment");
        expect(r.composition.currentBusinessState.workTemplateKey).toBeNull();
        expect(r.composition.currentBusinessState.workTemplateLabel).toBeNull();
        expect(r.composition.currentBusinessState.required).toBeNull();

        // The stage itself is still named truthfully — the child IS at Lead.
        expect(r.composition.currentBusinessState.stageKey).toBe("lead");
        expect(r.composition.currentBusinessState.stageLabel).toBe("Lead");
    });

    it("a child-grain stage with NO configured action returns null WITH a reason, not a refusal", () => {
        const r = composeChildGrainSurface({ row: childRow({ stageKey: "waitlist" }), stages: STAGES });
        expect(r.ok).toBe(true);
        if (!r.ok) return;
        expect(r.composition.segment).toBe("child");
        expect(r.composition.childOwnsStageWork).toBe(true);
        expect(r.composition.primaryAction).toBeNull();
        // "nothing is configured" must never be indistinguishable from "something failed"
        expect(r.composition.primaryActionAbsence).toBe("stage_configures_no_child_work");
    });

    it("a child-grain stage that DOES configure child work carries that action through", () => {
        const r = composeChildGrainSurface({ row: childRow({ stageKey: "enrolling" }), stages: STAGES });
        expect(r.ok).toBe(true);
        if (!r.ok) return;
        expect(r.composition.childOwnsStageWork).toBe(true);
        expect(r.composition.primaryAction).toEqual({
            actionRef: "child_record_outcome",
            label: "Record decision",
            workTemplateKey: "child_agreement",
        });
        expect(r.composition.primaryActionAbsence).toBeNull();
        expect(r.composition.currentBusinessState.workTemplateKey).toBe("child_agreement");
    });

    it("refuses a child at a stage the process does not configure", () => {
        const r = composeChildGrainSurface({ row: childRow({ stageKey: "ghost" }), stages: STAGES });
        expect(r.ok).toBe(false);
        if (r.ok) return;
        expect(r.reason).toContain("ghost");
        expect(r.reason).toContain("not an active configured stage");
    });

    it("refuses a child whose effective stage is unresolved rather than defaulting to one", () => {
        const r = composeChildGrainSurface({ row: childRow({ stageKey: null }), stages: STAGES });
        expect(r.ok).toBe(false);
    });

    it("refuses when the stage's grain and its plan's segment contradict each other (3B)", () => {
        const contradictory = stage({
            key: "confused",
            grain: "child",
            stage_operating_plan_v1: { journey_segment: "family" } as never,
        });
        const r = composeChildGrainSurface({
            row: childRow({ stageKey: "confused" }),
            stages: [contradictory],
        });
        expect(r.ok).toBe(false);
    });

    it("carries the four-part identity WHOLE — never collapsed to a scalar", () => {
        const r = composeChildGrainSurface({
            row: childRow({ subjectId: "cm-9", participationId: "pi-9", contextId: "opp-9", legacyOcmId: "ocm-9" }),
            stages: STAGES,
        });
        expect(r.ok).toBe(true);
        if (!r.ok) return;
        expect(r.composition.identity).toEqual({
            subjectId: "cm-9",
            participationId: "pi-9",
            contextId: "opp-9",
            legacyOcmId: "ocm-9",
        });
    });

    it("names the family only from rows already in hand — never invents one", () => {
        const withName = composeChildGrainSurface({
            row: childRow(),
            stages: STAGES,
            familyNamesByOpportunityId: new Map([["opp-1", "Kurzman"]]),
        });
        expect(withName.ok && withName.composition.family).toEqual({ opportunityId: "opp-1", name: "Kurzman", customerId: null });

        // No entry for this opportunity → the id is still true, the name is honestly absent.
        const without = composeChildGrainSurface({ row: childRow(), stages: STAGES });
        expect(without.ok && without.composition.family).toEqual({ opportunityId: "opp-1", name: null, customerId: null });
    });
});

describe("child identity truth bindings", () => {
    it("declares child.* keys and NEVER the family's primary-contact keys", () => {
        const r = composeChildGrainSurface({
            row: childRow(),
            stages: STAGES,
            familyNamesByOpportunityId: new Map([["opp-1", "Kurzman"]]),
        });
        expect(r.ok).toBe(true);
        if (!r.ok) return;
        const bindings = childSubjectIdentityTruthBindings(r.composition, "Wrigley Kurzman")!;

        expect(bindings["child.display_name"]).toBe("Wrigley Kurzman");
        expect(bindings["child.family_name"]).toBe("Kurzman");
        expect(bindings["child.customer_member_id"]).toBe("cm-1");
        expect(bindings["child.process_instance_id"]).toBe("pi-1");

        // The household's primary contact is NOT the child's identity.
        expect(bindings["person.primary_contact_name"]).toBeUndefined();
        expect(bindings["person.primary_phone"]).toBeUndefined();
        expect(bindings["person.primary_email"]).toBeUndefined();
        expect(bindings._inquiry_children).toBeUndefined();
    });

    it("omits absent values rather than emitting empties that render as data", () => {
        const r = composeChildGrainSurface({ row: childRow({ title: null }), stages: STAGES });
        expect(r.ok).toBe(true);
        if (!r.ok) return;
        const bindings = childSubjectIdentityTruthBindings(r.composition, null)!;
        expect("child.display_name" in bindings).toBe(false);
        expect("child.family_name" in bindings).toBe(false);
    });
});

import { describe, expect, it } from "vitest";

import { resolveOperationalMemberships } from "@/lib/search/searchOperationalMemberships";
import type { SearchConfiguredProcess } from "@/lib/search/searchProcessConfiguration";

/**
 * WORK VIEWS ARE OVERLAPPING CONFIGURED COHORTS, NOT STAGES.
 *
 * These pin the correction. The prior model resolved ONE stage-bound Work View per participant and
 * treated it as the whole truth. Live staging disproves it: the Kurzman Family sits at stage
 * `waitlist` and is in BOTH the `All` and `Tours` cohorts, because Tours is published as
 * `has_active_tour = true` with deliberately NO stage predicate. A stage→view mapping cannot express
 * that membership, so it would have had to invent one or drop it.
 *
 * The fixtures below mirror that published shape: child-grain lenses that overlap, a family catch-all,
 * and a booking-predicated family lens.
 */

const ids = (ms: ReturnType<typeof resolveOperationalMemberships>) => ms.map((m) => m.workViewId);

/**
 * Firefly's child-grain stages configure work templates with NO primary action. That is coherent
 * configuration, not a defect — so a child lens must stay enterable there, while a FAMILY surface on
 * the same stage stays enterable only because Mission was EPP-derived onto it.
 */
const WAITLIST_STAGE = {
    key: "waitlist",
    label: "Waitlist",
    grain: "child",
    is_active: true,
    sort_order: 1,
    stage_operating_plan_v1: {
        journey_segment: "child",
        work_templates: [
            { template_key: "waitlist_hold", label: "Hold place", primary: true, required: false },
        ],
    },
};

const ENROLLING_STAGE = { ...WAITLIST_STAGE, key: "enrolling", label: "Enrolling", sort_order: 2 };

const LEAD_STAGE = {
    key: "lead",
    label: "Lead",
    grain: "family",
    is_active: true,
    sort_order: 0,
    stage_operating_plan_v1: {
        journey_segment: "family",
        work_templates: [
            {
                template_key: "contact_family",
                label: "Contact Family",
                primary: true,
                required: true,
                primary_action: { action_ref: "lead.contact_family" },
            },
        ],
    },
};

const STAGES = [LEAD_STAGE, WAITLIST_STAGE, ENROLLING_STAGE];

/** Stage-scoped child lens — grain DERIVED from the stage it filters on. */
const WAITLIST_VIEW = {
    id: "waitlist_view",
    label: "Waitlist",
    filters_v1: [{ field_key: "opportunity_stage", operator: "is_any_of", value: ["waitlist"] }],
    display_order: 1,
    visible_in_runtime: true,
};

/** Stage-INDEPENDENT child inventory lens — must DECLARE its grain, else it reads as family. */
const ALL_CHILDREN_VIEW = {
    id: "all_children",
    label: "All Children",
    row_grain_v1: "child",
    display_order: 2,
    visible_in_runtime: true,
};

/** A second stage-scoped child lens that OVERLAPS the first. */
const PRIORITY_VIEW = {
    id: "priority_children",
    label: "Priority",
    row_grain_v1: "child",
    filters_v1: [
        { field_key: "opportunity_stage", operator: "is_any_of", value: ["waitlist", "enrolling"] },
    ],
    display_order: 3,
    visible_in_runtime: true,
};

/** The process-wide family catch-all. */
const ALL_VIEW = { id: "all_work", label: "All", display_order: 4, visible_in_runtime: true };

/** Booking-predicated family lens — the live Tours shape. No stage predicate, by design. */
const TOURS_VIEW = {
    id: "tours",
    label: "Tours",
    row_grain_v1: "family",
    filters_v1: [{ field_key: "has_active_tour", operator: "equals", value: true }],
    display_order: 5,
    visible_in_runtime: true,
};

function process(over: Partial<SearchConfiguredProcess> = {}): SearchConfiguredProcess {
    return {
        key: "enrollment",
        label: "Enrollment",
        department_id: "dept-1",
        stage_labels: { lead: "Lead", waitlist: "Waitlist", enrolling: "Enrolling" },
        operator_has_access: true,
        work_views: [WAITLIST_VIEW, ALL_CHILDREN_VIEW, PRIORITY_VIEW, ALL_VIEW, TOURS_VIEW],
        stages: STAGES,
        ...over,
    } as SearchConfiguredProcess;
}

/**
 * A child's Work View ROW identity is its PARTICIPATION (`process_instances.id`).
 *
 * Never the durable child: one child can hold two participations across two leads, and those are two
 * different rows — so the durable id names no single row and the runtime's guard refuses it.
 */
const PARTICIPATION_A = "pi-lennon-enrollment";
/** The durable child. Correct as the ASPECT item; never as the child-grain row id. */
const DURABLE_CHILD = "cm-lennon";

const child = (stageKey: string | null, memberRowId: string | null = PARTICIPATION_A) =>
    resolveOperationalMemberships({
        process: process(),
        subject: { grain: "child", stageKey, memberRowId },
    });

/** A family row as the queue materializes it — EPP keys and tour facts, not raw columns. */
const familyRow = (over: Record<string, unknown> = {}) => ({
    id: "opp-kurzman",
    stage_key: "waitlist",
    _effective_participant_stage_keys: ["waitlist"],
    ...over,
});

const family = (row: Record<string, unknown> | null, proc = process()) =>
    resolveOperationalMemberships({
        process: proc,
        subject: {
            grain: "family",
            stageKey: (row?.stage_key as string) ?? null,
            row,
            // A family lens rows at the CASE, so the case id is the row identity — here the two
            // genuinely coincide, which is precisely why the child case had to be separated out.
            memberRowId: (row?.id as string) ?? null,
        },
    });

describe("a membership carries the Work View's own row identity", () => {
    it("a CHILD membership carries the PARTICIPATION id, not the durable child", () => {
        // The defect this sprint exists to fix, at its source. The runtime selects child rows on
        // `process_instances.id`; anything else names no row in the evaluated page and is refused
        // with `subject_unavailable` — "That record isn't in this Work View".
        for (const membership of child("waitlist")) {
            expect(membership.operationalMemberId).toBe(PARTICIPATION_A);
            expect(membership.operationalMemberId).not.toBe(DURABLE_CHILD);
        }
    });

    it("a FAMILY membership carries the case id — there the row and the host coincide", () => {
        for (const membership of family(familyRow({ has_active_tour: true }))) {
            expect(membership.operationalMemberId).toBe("opp-kurzman");
        }
    });

    it("ONE CHILD, TWO PARTICIPATIONS ⇒ two distinct row identities", () => {
        // Why the durable id cannot be the row id, stated as behaviour: the same child across two
        // leads is two different rows, and a destination must name which one.
        const first = child("waitlist", "pi-lead-one")[0];
        const second = child("waitlist", "pi-lead-two")[0];

        expect(first.operationalMemberId).toBe("pi-lead-one");
        expect(second.operationalMemberId).toBe("pi-lead-two");
        expect(first.operationalMemberId).not.toBe(second.operationalMemberId);
        // …and they are the SAME cohort, so the view alone could never disambiguate them.
        expect(first.workViewId).toBe(second.workViewId);
    });

    it("NO resolvable member identity ⇒ NO destination, even when membership is true", () => {
        // The added truth gate. Membership can be provable while the way to REACH it is unknown, and
        // offering it then is what delivered the operator to the refusal banner.
        expect(child("waitlist", null)).toEqual([]);
        expect(child("waitlist", "   ")).toEqual([]);
    });
});

describe("a subject's ACTUAL Work View memberships", () => {
    it("OVERLAPPING: a waitlisted child belongs to more than one cohort at once", () => {
        // The headline correction. One stage, several truthful cohorts — none of them inferred.
        const memberships = child("waitlist");
        expect(ids(memberships)).toContain("waitlist_view");
        expect(ids(memberships)).toContain("all_children");
        expect(memberships.length).toBeGreaterThan(1);
    });

    it("THREE memberships are all returned — nothing collapses to a single answer", () => {
        expect(ids(child("waitlist"))).toEqual(["waitlist_view", "all_children", "priority_children"]);
    });

    it("SIBLINGS in one household resolve independently", () => {
        // Child A (waitlist) and Child B (enrolling) share a case and overlap only where the
        // configuration says they do. A shared host must not collapse them onto one answer.
        const a = ids(child("waitlist"));
        const b = ids(child("enrolling"));

        expect(a).toContain("waitlist_view");
        expect(b).not.toContain("waitlist_view");
        // They genuinely overlap in the two stage-independent / multi-stage lenses.
        expect(a).toContain("all_children");
        expect(b).toContain("all_children");
        expect(a).toContain("priority_children");
        expect(b).toContain("priority_children");
        expect(a).not.toEqual(b);
    });

    it("GRAIN: a child is never offered a family lens", () => {
        // The row in `All` is the FAMILY, not the child. Offering it would land the operator on a
        // family row and call it the child — the substitution this sprint removes.
        const memberships = ids(child("waitlist"));
        expect(memberships).not.toContain("all_work");
        expect(memberships).not.toContain("tours");
    });

    it("GRAIN: a household does not inherit its children's lenses", () => {
        const memberships = ids(family(familyRow()));
        expect(memberships).not.toContain("waitlist_view");
        expect(memberships).not.toContain("all_children");
        expect(memberships).not.toContain("priority_children");
    });

    it("the FAMILY belongs to the catch-all and to a booking-predicated lens simultaneously", () => {
        // The live Kurzman shape: stage `waitlist`, an active tour, therefore All AND Tours.
        const memberships = ids(family(familyRow({ has_active_tour: true })));
        expect(memberships).toEqual(["all_work", "tours"]);
    });

    it("STAGE DOES NOT CREATE MEMBERSHIP: no booking, no Tours — same stage either way", () => {
        // Tours carries no stage predicate. Membership therefore turns entirely on the booking fact,
        // which is precisely what a stage-bound resolver could never express.
        const withTour = ids(family(familyRow({ has_active_tour: true })));
        const without = ids(family(familyRow({ has_active_tour: false })));

        expect(withTour).toContain("tours");
        expect(without).not.toContain("tours");
        expect(without).toContain("all_work");
    });

    it("an UNSUPPORTED predicate never becomes evidence of membership", () => {
        // The evaluator is deliberately fail-open: an operator it does not understand passes the row
        // through under AND, because a COUNT would rather over-include than hide work. A destination
        // cannot inherit that generosity — the view would be offered, entered, and found not to
        // contain the subject. This fixture originally used a made-up operator and silently "passed",
        // which is exactly the failure mode.
        const bogus = {
            ...TOURS_VIEW,
            filters_v1: [{ field_key: "has_active_tour", operator: "is", value: true }],
        };
        const memberships = ids(
            family(familyRow({ has_active_tour: false }), process({ work_views: [bogus] as never })),
        );
        expect(memberships).toEqual([]);
    });

    it("an unproven family row yields NOTHING rather than a guess", () => {
        // No materialized row ⇒ the predicates cannot be evaluated. Silence, never an assumption.
        expect(family(null)).toEqual([]);
    });
});

describe("membership is gated by permission and by operability", () => {
    it("PERMISSION: a process the operator cannot reach offers no destinations", () => {
        // Naming the cohort would itself disclose where the subject is.
        const memberships = resolveOperationalMemberships({
            process: process({ operator_has_access: false }),
            subject: { grain: "child", stageKey: "waitlist", memberRowId: PARTICIPATION_A },
        });
        expect(memberships).toEqual([]);
    });

    it("HIDDEN views are not destinations", () => {
        const hidden = process({
            work_views: [{ ...WAITLIST_VIEW, visible_in_runtime: false }, ALL_CHILDREN_VIEW] as never,
        });
        const memberships = resolveOperationalMemberships({
            process: hidden,
            subject: { grain: "child", stageKey: "waitlist", memberRowId: PARTICIPATION_A },
        });
        expect(ids(memberships)).toEqual(["all_children"]);
    });

    it("MEMBERSHIP ≠ OPERATIONAL: a member of a lens that cannot compose is not offered", () => {
        // The `tours` false-green, pinned. The family matches the catch-all by predicate, but its
        // Mission stage offers no work templates at all, so the answer would refuse
        // `no_truthful_primary_action` on arrival. A pill that lights up over an empty Focus Panel is
        // not a destination.
        const brokenStages = [
            { key: "orphan", label: "Orphan", grain: "family", is_active: true, sort_order: 0 },
        ];
        const memberships = resolveOperationalMemberships({
            process: process({ work_views: [ALL_VIEW] as never, stages: brokenStages as never }),
            subject: { grain: "family", stageKey: "orphan", row: { id: "o", stage_key: "orphan" } },
        });
        expect(memberships).toEqual([]);
    });

    it("a CHILD lens stays enterable when the stage configures no primary action", () => {
        // Read as one rule with the family path, this would hide Waitlist from a waitlisted child —
        // the single destination that is actually true. Firefly's child stages configure no actions.
        expect(ids(child("waitlist"))).toContain("waitlist_view");
    });

    it("a child whose stage is not an active configured stage is offered nothing", () => {
        expect(child("archived_stage")).toEqual([]);
        expect(child(null)).toEqual([]);
    });

    it("a lens whose grain cannot be resolved is EXCLUDED, never assumed", () => {
        // Stage-scoped across two grains: a surface cannot be grain-ambiguous, so it is not a place
        // anyone can be sent. Guessing here is the defaulting G-1 forbids.
        const ambiguous = {
            id: "ambiguous",
            label: "Mixed",
            filters_v1: [
                { field_key: "opportunity_stage", operator: "is_any_of", value: ["lead", "waitlist"] },
            ],
            display_order: 1,
            visible_in_runtime: true,
        };
        const memberships = resolveOperationalMemberships({
            process: process({ work_views: [ambiguous] as never }),
            subject: { grain: "child", stageKey: "waitlist", memberRowId: PARTICIPATION_A },
        });
        expect(memberships).toEqual([]);
    });
});

describe("the membership answer stays configuration-driven", () => {
    it("RENAMING a view does not change membership", () => {
        const renamed = process({
            work_views: [{ ...WAITLIST_VIEW, label: "Holding Pool" }, ALL_CHILDREN_VIEW] as never,
        });
        const memberships = resolveOperationalMemberships({
            process: renamed,
            subject: { grain: "child", stageKey: "waitlist", memberRowId: PARTICIPATION_A },
        });
        expect(ids(memberships)).toContain("waitlist_view");
        expect(memberships.find((m) => m.workViewId === "waitlist_view")?.workViewLabel).toBe(
            "Holding Pool",
        );
    });

    it("REORDERING views changes only the order, never the set", () => {
        const reordered = process({
            work_views: [PRIORITY_VIEW, ALL_CHILDREN_VIEW, WAITLIST_VIEW] as never,
        });
        const memberships = resolveOperationalMemberships({
            process: reordered,
            subject: { grain: "child", stageKey: "waitlist", memberRowId: PARTICIPATION_A },
        });
        expect(ids(memberships)).toEqual(["priority_children", "all_children", "waitlist_view"]);
    });

    it("no childcare vocabulary decides anything — grain and predicates do", () => {
        // Nothing here knows what "waitlist" means. Rename every key and the shape holds.
        const stages = [
            { ...WAITLIST_STAGE, key: "phase_x", label: "Phase X" },
            { ...LEAD_STAGE, key: "phase_y", label: "Phase Y" },
        ];
        const view = {
            id: "phase_x_view",
            label: "Phase X",
            filters_v1: [{ field_key: "opportunity_stage", operator: "is_any_of", value: ["phase_x"] }],
            display_order: 1,
            visible_in_runtime: true,
        };
        const memberships = resolveOperationalMemberships({
            process: process({ work_views: [view] as never, stages: stages as never }),
            subject: { grain: "child", stageKey: "phase_x", memberRowId: PARTICIPATION_A },
        });
        expect(ids(memberships)).toEqual(["phase_x_view"]);
    });
});

/**
 * UNKNOWN IS NOT INHERITED.
 *
 * `locationInherited` was `!childLocationId && Boolean(opportunitySiteId)` — absence read as "the
 * child has no site of its own". At commit the answer does not carry each child's `location_id`,
 * so the card asserted "Inherited from lead" for a child that DOES own a placement, and the drawer
 * removed the badge ~1.6s later. Measured on deployed 6734f408f that removal was the single last
 * authoritative mutation on the whole surface: a false claim, corrected late.
 *
 * Same family of defect as `countOpenWork(null) === 0` — a fallback state wearing the clothes of
 * an authoritative answer.
 *
 * These gates drive the real evidence builder. The location VALUE must survive in every case;
 * only the provenance sentence is conditional.
 */
import { describe, expect, it } from "vitest";

import { buildChildrenCardEvidence } from "@/lib/adminV2/runtime/focusPanel/children/buildChildrenCardEvidence";
import type { OperationalContext } from "@/lib/adminV2/runtime/operationalContext/types";

const LEAD_SITE = "loc-lead-1";
const LEAD_LABEL = "North Campus";

/** A context whose single inquiry child is described exactly as the caller states. */
const ctx = (child: Record<string, unknown>): OperationalContext =>
    ({
        grain: "case",
        subject: { type: "opportunity", id: "opp-1", label: "Specq household" },
        truth: {
            id: "opp-1",
            location_id: LEAD_SITE,
            _location_label: LEAD_LABEL,
            _inquiry_children: [child],
        },
        businessProcess: { key: null, label: null, stageKey: null, stages: [] },
        capabilities: { canMutate: false, maskedChannels: false },
    }) as unknown as OperationalContext;

/*
 * THE REAL COMMIT-TIME SHAPE, captured from deployed 02c6a583f and redacted to field shape only.
 *
 * The previous repair passed seven gates and five plants against a synthetic row whose
 * `location_id` key was ABSENT, and then changed nothing in production — because the real payload
 * carries the key with a null value. A green gate over the wrong payload shape is not
 * certification, so the fixture is now the captured shape and the absent-key variant is gone.
 */
const REAL_COMMIT_CHILD = {
    id: "3ce7389c-0000-0000-0000-000000000000",
    customer_member_id: "a227e460-0000-0000-0000-000000000000",
    person_id: null,
    display_name: "Specee Redacted",
    first_name: "Specee",
    last_name: "Redacted",
    dob: null,
    age: null,
    linked_on_inquiry: true,
    ocm_id: "3ce7389c-0000-0000-0000-000000000000",
    program_category_id: null,
    program_key: null,
    desired_program_label: null,
    schedule_type: null,
    desired_schedule_label: null,
    outcome_status_key: "new_inquiry",
    outcome_status_label: "New Lead",
    fit_status: null,
    notes: null,
    start_date: null,
    location_id: null,
    location_label: null,
    program_room_cohort_key: null,
    program_room_cohort_label: null,
    custom_fields: {},
    metadata: { source: "create_lead_ingest" },
    photo_url: null,
    created_at: "2026-09-13T14:02:41.807662+00:00",
    updated_at: null,
    _participation_source: "ocm",
    _operational_facts_source: "ocm",
} as const;

const kid = (over: Record<string, unknown> = {}) => ({ ...REAL_COMMIT_CHILD, ...over });

const only = (c: OperationalContext) => {
    const kids = buildChildrenCardEvidence(c).children;
    expect(kids, "fixture must produce exactly one child").toHaveLength(1);
    return kids[0];
};

describe("child location provenance", () => {
    it("A/C — REAL commit shape (location_id present and null) claims NOTHING", () => {
        /*
         * This is the exact payload the deployed document produces. The key IS present and null,
         * which is why the previous key-presence guard failed silently in production. Commit has
         * no scheduling projection, so provenance is unknown and no badge is claimed.
         */
        const child = only(ctx(kid()));
        expect(child.locationInherited).toBeFalsy();
    });

    it("D — the location VALUE still renders while provenance is unknown", () => {
        // The lead's site is genuinely the site in effect; withholding the qualifier must not
        // withhold the answer.
        expect(only(ctx(kid())).location).toBe(LEAD_LABEL);
    });

    it("B — once the projection has ANSWERED, an absent own site does claim inheritance", () => {
        /*
         * The scheduling projection is the authority that distinguishes the states — settlement
         * drops the badge precisely because it appears. With it present and carrying no site, the
         * child genuinely owns none, and the qualifier is truthful.
         */
        const c = ctx(kid());
        (c.truth as Record<string, unknown>)._scheduling_projection = {
            byMemberId: { [REAL_COMMIT_CHILD.customer_member_id]: { child: { siteId: null } } },
        };
        const child = only(c);
        expect(child.locationInherited).toBe(true);
        expect(child.location).toBe(LEAD_LABEL);
    });

    it("B2 — the projection answering with a site means OWNED, never inherited", () => {
        const c = ctx(kid());
        (c.truth as Record<string, unknown>)._scheduling_projection = {
            byMemberId: {
                [REAL_COMMIT_CHILD.customer_member_id]: { child: { siteId: "loc-own-9", siteName: "South Campus" } },
            },
        };
        expect(only(c).locationInherited).toBeFalsy();
    });

    it("C — a child-owned location never claims inheritance", () => {
        const child = only(ctx(kid({ location_id: "loc-own-9", location_label: "South Campus" })));
        expect(child.locationInherited).toBeFalsy();
        expect(child.location).toBe("South Campus");
    });

    it("D — key presence alone never implies inheritance", () => {
        // The failure mode, pinned: null, empty and whitespace all carry the key and none of them
        // answers the provenance question at commit.
        for (const v of [null, "", "   "]) {
            expect(only(ctx(kid({ location_id: v }))).locationInherited, String(v)).toBeFalsy();
        }
    });

    it("inheritance is never claimed when the lead itself has no site", () => {
        const c = ctx(kid({ location_id: null }));
        (c.truth as Record<string, unknown>).location_id = null;
        (c.truth as Record<string, unknown>)._location_label = null;
        expect(only(c).locationInherited).toBeFalsy();
    });
});

describe("J — the fixture is the captured production shape, and stays that way", () => {
    /*
     * THE GATE THAT WAS MISSING.
     *
     * The previous repair passed every code plant and still failed in production, because every
     * plant varied the CODE and none varied the FIXTURE. The suite could not tell it was
     * reasoning about a payload the product never emits. These assertions pin the captured shape
     * itself, so reverting to the synthetic absent-key variant fails loudly.
     */
    it("carries location_id as an OWN property whose value is null", () => {
        // Present-and-null is the whole point: it is why key presence could not mean "answered".
        expect(Object.prototype.hasOwnProperty.call(REAL_COMMIT_CHILD, "location_id")).toBe(true);
        expect(REAL_COMMIT_CHILD.location_id).toBeNull();
        expect(Object.prototype.hasOwnProperty.call(REAL_COMMIT_CHILD, "location_label")).toBe(true);
        expect(REAL_COMMIT_CHILD.location_label).toBeNull();
    });

    it("carries the OCM provenance markers the deployed answer emits", () => {
        expect(REAL_COMMIT_CHILD._participation_source).toBe("ocm");
        expect(REAL_COMMIT_CHILD._operational_facts_source).toBe("ocm");
        expect(REAL_COMMIT_CHILD.ocm_id).toBeTruthy();
    });

    it("carries no scheduling projection — commit genuinely cannot classify provenance", () => {
        // If a future payload DOES answer provenance at commit, this fails and the contract is
        // revisited deliberately rather than the badge quietly reappearing.
        expect("_scheduling_projection" in REAL_COMMIT_CHILD).toBe(false);
    });
});

describe("F — the repair introduces no read", () => {
    it("the evidence builder stays a pure projection", () => {
        // It takes a context and returns a model; a read here would put I/O inside render.
        expect(buildChildrenCardEvidence.constructor.name).toBe("Function");
        const src = String(buildChildrenCardEvidence);
        for (const forbidden of ["await ", "supabase", "fetch("]) {
            expect(src).not.toContain(forbidden);
        }
    });
});

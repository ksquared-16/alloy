import { describe, expect, it } from "vitest";

import { resolveSearchDestinations } from "@/lib/search/searchDestinations";
import type { SearchContext, SearchSubject } from "@/lib/search/searchContracts";

/**
 * SEARCH MUST CONSUME THE PARTICIPANT'S OWN POSITION — as a FALLBACK SIGNAL.
 *
 * These still hold: a child's stage-bound Work View outranks the family/case unit, which is what the
 * live defect got wrong (the result read "Enrollment — Waitlist" while the destination committed the
 * family's Lead unit, so a waitlisted child opened a queue that does not contain them).
 *
 * ── DEMOTED ──
 *
 * Stage binding is NOT proof of Work View membership, and these tests no longer claim it is. A Work
 * View is an overlapping configured COHORT; a stage is a position in the Process. Binding through
 * `compat_queue_key` cannot express a booking-predicated lens (the live Tours) or a catch-all at all,
 * and the runtime authority refuses to read that key as identity — "a lane binding assigned by array
 * position".
 *
 * Eligibility now comes from `resolveOperationalMemberships`, proven in
 * `searchOperationalMemberships.test.ts` and `searchMembershipDestinations.test.ts`. What survives
 * here is the stage signal's remaining job: ranking, and the fallback host when nothing better can be
 * proven. The final test pins the precedence between the two.
 */

const CASE = "opp-kurzman";
const HOUSEHOLD = "cust-kurzman";

/** The FAMILY answer — case grain. Correct for the household, wrong for a child elsewhere. */
const FAMILY_UNIT = "lifecycle_wu_lead";

const participation = (over: Partial<SearchContext> = {}): SearchContext => ({
    kind: "process",
    key: "enrollment",
    label: "Enrollment",
    detail: "Waitlist",
    destination_entity_type: "opportunity",
    destination_entity_id: CASE,
    destination_work_unit_key: FAMILY_UNIT,
    destination_work_view_id: "waitlist",
    ...over,
});

const child = (id: string): SearchSubject => ({
    kind: "child",
    id,
    display_name: "Lennon Kurzman",
    person_id: null,
    household_id: HOUSEHOLD,
});

const resolve = (subject: SearchSubject, contexts: SearchContext[]) =>
    resolveSearchDestinations({ subject, contexts, promotedKeys: [] });

describe("a participant's destination carries their own Work View", () => {
    it("the primary destination carries the stage-bound view, not the family unit", () => {
        const primary = resolve(child("cm-lennon"), [participation()])[0];

        expect(primary.host_work_view_id).toBe("waitlist");
        // The family answer is still carried — as a FALLBACK for callers, never the preferred one.
        expect(primary.host_work_unit_key).toBe(FAMILY_UNIT);
        expect(primary.host_work_view_id).not.toBe(primary.host_work_unit_key);
    });

    it("SIBLINGS in one case resolve different views", () => {
        // One household, one case, two children, two destinations. No single family-level answer
        // can serve both, which is why the family unit cannot be the authority.
        const waitlisted = resolve(child("cm-lennon"), [participation()])[0];
        const touring = resolve(child("cm-wrigley"), [
            participation({ detail: "Tour", destination_work_view_id: "tours" }),
        ])[0];

        expect(waitlisted.host_work_view_id).toBe("waitlist");
        expect(touring.host_work_view_id).toBe("tours");
        // Same case, same family unit — only the view distinguishes them.
        expect(waitlisted.host_entity_id).toBe(touring.host_entity_id);
        expect(waitlisted.host_work_unit_key).toBe(touring.host_work_unit_key);
    });

    it("falls back to the family unit when the stage has NO configured view", () => {
        const primary = resolve(child("cm-lennon"), [
            participation({ destination_work_view_id: null }),
        ])[0];

        expect(primary.host_work_view_id).toBeNull();
        expect(primary.host_work_unit_key).toBe(FAMILY_UNIT);
    });

    it("a PROCESS destination resolves the view of the process the operator asked for", () => {
        const destinations = resolve(child("cm-lennon"), [
            participation(),
            participation({
                key: "annual_registration",
                label: "Annual Registration",
                detail: "Needs documents",
                destination_work_view_id: "registration",
            }),
        ]);

        const enrollment = destinations.find((d) => d.key === "process:enrollment");
        const annual = destinations.find((d) => d.key === "process:annual_registration");

        expect(enrollment!.host_work_view_id).toBe("waitlist");
        expect(annual!.host_work_view_id).toBe("registration");
    });

    it("PRECEDENCE: a proven membership outranks the stage-bound answer", () => {
        // The demotion, stated as behaviour. Stage binding says `waitlist`; evaluated membership says
        // the subject is actually in `all_children`. Membership wins, because it is the only one of
        // the two that was checked against the subject rather than inferred from where they stand.
        const primary = resolve(child("cm-lennon"), [
            {
                ...participation(),
                operational_memberships: [
                    {
                        work_view_id: "all_children",
                        label: "All Children",
                        row_grain: "child",
                        host_work_unit_key: FAMILY_UNIT,
                        host_entity_id: CASE,
                        // A child lens selects the PARTICIPATION, not the case that hosts the panel.
                        operational_member_id: "pi-lennon-enrollment",
                    },
                ],
            },
        ])[0];

        expect(primary.host_work_view_id).toBe("all_children");
    });

    it("a HOUSEHOLD subject does not borrow a child's view", () => {
        // A household has no stage of its own. It must resolve its case's canonical context rather
        // than inheriting whichever child happened to be enumerated first.
        const household: SearchSubject = {
            kind: "household",
            id: HOUSEHOLD,
            display_name: "Kurzman Family",
            household_id: HOUSEHOLD,
            household_case_entity_id: CASE,
            household_case_work_unit_key: FAMILY_UNIT,
        };

        const primary = resolve(household, [])[0];
        expect(primary.host_work_unit_key).toBe(FAMILY_UNIT);
        expect(primary.host_work_view_id ?? null).toBeNull();
    });
});

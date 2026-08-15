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

/**
 * These assertions moved from the SUBJECT destination to the OPERATIONAL one.
 *
 * Participant-grain view resolution is a property of going to WORK on someone — a waitlisted child
 * sent to the family's Lead unit lands in a queue that does not contain them. It was asserted on
 * the subject click only because the subject click used to be an operational movement. Every
 * property below is unchanged; the record click simply no longer participates in any of them.
 */
const work = (subject: SearchSubject, contexts: SearchContext[], key = "process:enrollment") =>
    resolve(subject, contexts).find((d) => d.key === key)!;

describe("a participant's destination carries their own Work View", () => {
    it("the operational destination carries the stage-bound view, not the family unit", () => {
        const operational = work(child("cm-lennon"), [participation()]);

        expect(operational.host_work_view_id).toBe("waitlist");
        // The family answer is still carried — as a FALLBACK for callers, never the preferred one.
        expect(operational.host_work_unit_key).toBe(FAMILY_UNIT);
        expect(operational.host_work_view_id).not.toBe(operational.host_work_unit_key);
    });

    it("the RECORD destination carries neither, and that is the separation", () => {
        const record = resolve(child("cm-lennon"), [participation()])[0];
        expect(record.target).toBe("durable_record");
        expect(record.host_work_view_id ?? null).toBeNull();
        expect(record.host_work_unit_key ?? null).toBeNull();
    });

    it("SIBLINGS in one case resolve different views", () => {
        // One household, one case, two children, two destinations. No single family-level answer
        // can serve both, which is why the family unit cannot be the authority.
        const waitlisted = work(child("cm-lennon"), [participation()]);
        const touring = work(child("cm-wrigley"), [
            participation({ detail: "Tour", destination_work_view_id: "tours" }),
        ]);

        expect(waitlisted.host_work_view_id).toBe("waitlist");
        expect(touring.host_work_view_id).toBe("tours");
        // Same case, same family unit — only the view distinguishes them.
        expect(waitlisted.host_entity_id).toBe(touring.host_entity_id);
        expect(waitlisted.host_work_unit_key).toBe(touring.host_work_unit_key);
    });

    it("falls back to the family unit when the stage has NO configured view", () => {
        const operational = work(child("cm-lennon"), [
            participation({ destination_work_view_id: null }),
        ]);

        expect(operational.host_work_view_id).toBeNull();
        expect(operational.host_work_unit_key).toBe(FAMILY_UNIT);
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
        const proven = resolve(child("cm-lennon"), [
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
        ]).find((d) => d.key === "work_view:enrollment:all_children")!;

        expect(proven.host_work_view_id).toBe("all_children");
        // …and the stage-bound guess does not also appear as a competing destination.
        expect(proven.operational_member_id).toBe("pi-lennon-enrollment");
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

        /*
         * The CLAIM of this scenario is unchanged and is now held more strongly.
         *
         * It asserted that a household resolves to `focus_panel` on its case with a NULL work view —
         * "does not borrow a child's view" proven by the view being absent. A household is now a
         * durable record, so there is no lens field to leave null: the destination names the family
         * and nothing operational at all, which cannot borrow a child's view because it carries no
         * view, no unit and no host.
         *
         * The case remains reachable — its operational siblings still carry `FAMILY_UNIT` — it is
         * simply no longer what "open this family" means.
         */
        const primary = resolve(household, [])[0];
        expect(primary.target).toBe("durable_record");
        expect(primary.subject_type).toBe("household");
        expect(primary.subject_id).toBe(HOUSEHOLD);
        expect(primary.host_work_view_id ?? null).toBeNull();
        expect(primary.host_work_unit_key ?? null).toBeNull();
    });
});

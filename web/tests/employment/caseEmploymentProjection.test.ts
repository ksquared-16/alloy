/**
 * CASE → EMPLOYMENT PROJECTION — the ownership boundary, asserted.
 *
 * The risk this file exists to catch is not a wrong label. It is the projection quietly becoming a
 * SECOND AUTHORITY on employment: deriving its own state, filtering by its own idea of "current",
 * or persisting anything onto the opportunity. Every test below is written against that failure.
 */

import { describe, expect, it, vi, beforeEach } from "vitest";

import {
    buildCaseEmploymentProjection,
    EMPTY_CASE_EMPLOYMENT_PROJECTION,
} from "@/lib/employment/buildCaseEmploymentProjection";

const ORG = "00000000-0000-4000-8000-000000000001";
const PRIMARY = "00000000-0000-4000-8000-000000000101";
const SECOND = "00000000-0000-4000-8000-000000000102";
const CHILD = "00000000-0000-4000-8000-000000000103";

const composition = vi.fn();
vi.mock("@/lib/employment/buildPersonEmploymentComposition", () => ({
    buildPersonEmploymentComposition: (...args: unknown[]) => composition(...args),
}));

/**
 * Records every table the projection touched, so a NEW read shows up here rather than silently.
 *
 * Thenable, because `customer_persons` is filtered with `.eq()` only — a builder that resolves
 * exclusively on `.in()` would leave that query hanging forever rather than failing.
 */
function supabaseWith(employedPersonIds: string[], householdContacts: string[] = []) {
    const calls: Array<{ table: string; personIds: string[] }> = [];
    const supabase = {
        from(table: string) {
            const rowsFor = (ids: string[] | null) => {
                if (table === "employments") {
                    const scope = ids ?? [];
                    return scope.filter((id) => employedPersonIds.includes(id)).map((id) => ({ person_id: id }));
                }
                if (table === "customer_persons") {
                    return (householdContacts.length ? householdContacts : employedPersonIds).map((id) => ({
                        person_id: id,
                    }));
                }
                if (table === "persons") {
                    return (ids ?? []).map((id) => ({ id, first_name: "Resolved", last_name: "Name" }));
                }
                return [];
            };
            const builder: Record<string, unknown> = {
                select: () => builder,
                eq: () => builder,
                in: (_col: string, ids: string[]) => {
                    calls.push({ table, personIds: ids });
                    return Promise.resolve({ data: rowsFor(ids), error: null });
                },
                then: (resolve: (v: unknown) => unknown) => {
                    calls.push({ table, personIds: [] });
                    return Promise.resolve({ data: rowsFor(null), error: null }).then(resolve);
                },
            };
            return builder;
        },
    };
    return { supabase: supabase as never, calls };
}

function personComposition(overrides: Record<string, unknown> = {}) {
    return {
        is_staff: true,
        current: {
            id: "emp-1",
            status: "active",
            state_label: "Active",
            is_open: true,
            position_label: "Lead Teacher",
            employment_type: "full_time",
            employment_type_label: "Full time",
            primary_location_id: "loc-1",
            primary_location_label: "Riverside",
            external_employee_id: null,
            start_date: "2026-08-01",
            end_date: null,
            end_reason_key: null,
        },
        periods: [],
        configured_facts: [],
        never_employed: false,
        ...overrides,
    };
}

describe("buildCaseEmploymentProjection", () => {
    beforeEach(() => {
        composition.mockReset();
        composition.mockResolvedValue(personComposition());
    });

    it("asks the canonical provider for the answer — it never reads employment columns itself", async () => {
        const { supabase, calls } = supabaseWith([PRIMARY]);
        await buildCaseEmploymentProjection(
            supabase,
            ORG,
            { householdId: null, primaryPersonId: PRIMARY, knownContacts: [
                { id: PRIMARY, label: "Avery Guardian" },
                { id: CHILD, label: "Joe Child" },
            ] },
        );

        // Exactly one table read, and it is the applicability test — not the answer.
        expect(calls.map((c) => c.table)).toEqual(["employments"]);
        expect(composition).toHaveBeenCalledTimes(1);
        expect(composition).toHaveBeenCalledWith(supabase, ORG, PRIMARY);
    });

    it("carries the person-owned composition VERBATIM", async () => {
        const owned = personComposition({ configured_facts: [{ field_key: "cpr", label: "CPR", display: "Yes" }] });
        composition.mockResolvedValue(owned);
        const { supabase } = supabaseWith([PRIMARY]);

        const out = await buildCaseEmploymentProjection(
            supabase,
            ORG,
            { householdId: null, primaryPersonId: PRIMARY, knownContacts: [{ id: PRIMARY, label: "Avery Guardian" }] },
        );

        // Identity, not a copy: nothing in between may reshape an employment fact.
        expect(out.people[0]!.employment).toBe(owned);
        expect(out.primary?.employment).toBe(owned);
    });

    it("costs ONE query and no compositions when nobody linked to the case is employed", async () => {
        const { supabase, calls } = supabaseWith([]);
        const out = await buildCaseEmploymentProjection(
            supabase,
            ORG,
            { householdId: null, primaryPersonId: PRIMARY, knownContacts: [
                { id: PRIMARY, label: "Avery Guardian" },
                { id: SECOND, label: "Blake Guardian" },
                { id: CHILD, label: "Joe Child" },
            ] },
        );

        expect(out).toEqual(EMPTY_CASE_EMPLOYMENT_PROJECTION);
        expect(calls).toHaveLength(1);
        expect(composition).not.toHaveBeenCalled();
    });

    it("answers truthfully when the employed contact is NOT the primary person", async () => {
        const { supabase } = supabaseWith([SECOND]);
        const out = await buildCaseEmploymentProjection(
            supabase,
            ORG,
            { householdId: null, primaryPersonId: PRIMARY, knownContacts: [
                { id: PRIMARY, label: "Avery Guardian" },
                { id: SECOND, label: "Blake Guardian" },
            ] },
        );

        // `primary` is null because the PRIMARY person holds no employment — but the case's real
        // employment is still reported. Filtering to the primary person would have hidden it.
        expect(out.primary).toBeNull();
        expect(out.people.map((p) => p.person_id)).toEqual([SECOND]);
        expect(out.people[0]!.person_label).toBe("Blake Guardian");
    });

    it("orders the primary person first so the card leads with the case's own contact", async () => {
        const { supabase } = supabaseWith([PRIMARY, SECOND]);
        const out = await buildCaseEmploymentProjection(
            supabase,
            ORG,
            { householdId: null, primaryPersonId: PRIMARY, knownContacts: [
                { id: SECOND, label: "Blake Guardian" },
                { id: PRIMARY, label: "Avery Guardian" },
            ] },
        );

        expect(out.people.map((p) => p.person_id)).toEqual([PRIMARY, SECOND]);
        expect(out.primary?.person_id).toBe(PRIMARY);
    });

    it("defers to the composition when it says never_employed, even though a row matched", async () => {
        composition.mockResolvedValue(personComposition({ never_employed: true, is_staff: false, current: null }));
        const { supabase } = supabaseWith([PRIMARY]);
        const out = await buildCaseEmploymentProjection(
            supabase,
            ORG,
            { householdId: null, primaryPersonId: PRIMARY, knownContacts: [{ id: PRIMARY, label: "Avery Guardian" }] },
        );

        // The provider is the authority on "has this person ever worked here", not our row probe.
        expect(out.people).toHaveLength(0);
    });

    it("finds the household's contacts when the payload knows NONE of them", async () => {
        // The defect this catches, caught live: the seeded Smith case carries an empty
        // `_opportunity_persons` AND a null `primary_person_id`, so a projection derived only from
        // the payload arrays answered "nobody works here" while the household's primary contact was
        // employed and standing on the Attendance roster.
        const { supabase, calls } = supabaseWith([PRIMARY]);
        const out = await buildCaseEmploymentProjection(supabase, ORG, {
            householdId: "household-1",
            primaryPersonId: null,
            knownContacts: [],
        });

        expect(calls.some((c) => c.table === "customer_persons")).toBe(true);
        expect(out.people.map((p) => p.person_id)).toEqual([PRIMARY]);
        // No label was known, so the projection resolved one rather than rendering a blank name.
        expect(out.people[0]!.person_label).toBe("Resolved Name");
    });

    it("does nothing without linked persons or an org", async () => {
        const { supabase, calls } = supabaseWith([PRIMARY]);
        expect(await buildCaseEmploymentProjection(supabase, ORG, { householdId: null, primaryPersonId: null, knownContacts: [] })).toEqual(
            EMPTY_CASE_EMPLOYMENT_PROJECTION,
        );
        expect(await buildCaseEmploymentProjection(supabase, "  ", { householdId: null, primaryPersonId: PRIMARY, knownContacts: [{ id: PRIMARY, label: null }] })).toEqual(
            EMPTY_CASE_EMPLOYMENT_PROJECTION,
        );
        expect(calls).toHaveLength(0);
    });
});

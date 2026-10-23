/**
 * The roster names a child's DERIVED homerooms (V7-03) — zero, one or many — and never a chosen
 * room: not the primary row's, not the first row's, not the enrollment draft's. Staff keep their
 * primary room, which is a staffing fact. Fixture-backed (fake client); the resolver itself is
 * covered by tests/location/homerooms.test.ts and the real database by the live suite.
 */
import { describe, expect, it } from "vitest";

import { buildAssignmentRosterReadModel } from "@/lib/scheduling/roster/buildAssignmentRosterReadModel";

type Row = Record<string, unknown>;
const ORG = "org-1";
const SITE = "site-1";
const HOME = "cat-home";
const ENRICH = "cat-enrich";

/** Reads only; unknown tables answer empty. Filters: eq / in. */
function fakeSupabase(tables: Record<string, Row[]>) {
    return {
        from(table: string) {
            const eqs: Record<string, unknown> = {};
            const ins: Record<string, string[]> = {};
            const rows = () =>
                (tables[table] ?? []).filter(
                    (r) =>
                        Object.entries(eqs).every(([k, v]) => r[k] === v) &&
                        Object.entries(ins).every(([k, list]) => list.includes(String(r[k]))),
                );
            const self: Record<string, unknown> = {
                select: () => self,
                eq: (k: string, v: unknown) => ((eqs[k] = v), self),
                in: (k: string, v: unknown[]) => ((ins[k] = v.map(String)), self),
                is: () => self, not: () => self, gte: () => self, lte: () => self, or: () => self,
                order: () => self, limit: () => self, range: () => self,
                maybeSingle: async () => ({ data: rows()[0] ?? null, error: null }),
                single: async () => ({ data: rows()[0] ?? null, error: null }),
                then: (resolve: (v: unknown) => unknown) => Promise.resolve({ data: rows(), error: null }).then(resolve),
            };
            return self;
        },
        rpc: async () => ({ data: [], error: null }),
    } as never;
}

const room = (id: string, label: string, uses?: string[], unit_role = "operational_group"): Row => ({
    id, org_id: ORG, label, location_type: "unit", unit_role, metadata: uses ? { space_uses: uses } : {},
});

function assignment(over: Row): Row {
    return {
        org_id: ORG, site_location_id: SITE, subject_type: "child", subject_person_id: null, enrollment_agreement_id: "ag-1",
        customer_member_id: "m-1", is_primary: false, operational_assignment_type_id: null, schedule_pattern_id: "p",
        start_date: "2020-01-01", end_date: null, status: "active", commitment_kind: "committed", ...over,
    };
}

const base = (): Record<string, Row[]> => ({
    customer_members: [{ id: "m-1", org_id: ORG, first_name: "Ava", last_name: "Q", person_id: null }],
    child_enrollment_agreements: [{ id: "ag-1", org_id: ORG, customer_member_id: "m-1", person_id: null, site_location_id: SITE, status: "active" }],
    operational_assignment_types: [
        { id: HOME, org_id: ORG, label: "Homeroom", subject_types: ["child"], default_behavior: { providesHomeroom: true } },
        { id: ENRICH, org_id: ORG, label: "Enrichment", subject_types: ["child"], default_behavior: {} },
    ],
    locations: [
        room("t2", "Toddler 2", [HOME]),
        room("t3", "Toddler 3", [HOME]),
        room("legacy", "Legacy Room"),
        room("gym", "Gym", [ENRICH], "shared_space"),
    ],
    schedule_patterns: [{ id: "p", org_id: ORG, weekdays: [1, 2, 3, 4, 5] }],
});

const homeroomsOf = async (t: Record<string, Row[]>) =>
    (await buildAssignmentRosterReadModel(fakeSupabase(t), ORG, SITE, null)).subjects[0];

describe("roster homerooms", () => {
    it("Toddler 2 plus Toddler 3 → both, in display order, each with its assignment", async () => {
        const t = base();
        t.schedule_assignments = [
            assignment({ id: "a-t3", room_location_id: "t3", operational_assignment_type_id: HOME }),
            assignment({ id: "a-t2", room_location_id: "t2", is_primary: true }),
        ];
        const s = await homeroomsOf(t);
        expect(s.homerooms.map((h) => [h.spaceLabel, h.sources.map((x) => x.assignmentId)])).toEqual([
            ["Toddler 2", ["a-t2"]],
            ["Toddler 3", ["a-t3"]],
        ]);
        expect(s.staffPrimaryRoom).toBeNull();
    });

    it("Toddler 2 plus an enrichment in the gym → Toddler 2 only", async () => {
        const t = base();
        t.schedule_assignments = [
            assignment({ id: "a-t2", room_location_id: "t2", is_primary: true }),
            assignment({ id: "a-gym", room_location_id: "gym", operational_assignment_type_id: ENRICH }),
        ];
        expect((await homeroomsOf(t)).homerooms.map((h) => h.spaceLabel)).toEqual(["Toddler 2"]);
    });

    it("a primary in an UNCONFIGURED classroom gives no homeroom — the primary row is not a fallback", async () => {
        const t = base();
        t.schedule_assignments = [assignment({ id: "a-legacy", room_location_id: "legacy", is_primary: true })];
        const s = await homeroomsOf(t);
        expect(s.homerooms).toEqual([]);
        expect(s.assignments.map((a) => [a.isPrimary, a.roomName])).toEqual([[true, "Legacy Room"]]);
    });

    it("a pre-enrolment draft room is not a homeroom", async () => {
        const t = base();
        t.child_enrollment_agreements = [];
        t.schedule_assignments = [assignment({ id: "bc", enrollment_agreement_id: null, commitment_kind: "proposed", status: "planned", room_location_id: "t2", operational_assignment_type_id: HOME })];
        t.process_instances = [{ org_id: ORG, process_key: "enrollment", subject_id: "m-1", created_at: "2026-10-01T00:00:00Z", metadata: { program_room_cohort_key: "t3" } }];
        expect((await homeroomsOf(t)).homerooms).toEqual([]);
    });

    it("staff keep their primary room and have no homerooms", async () => {
        const t = base();
        t.schedule_assignments = [
            assignment({ id: "s1", subject_type: "staff", subject_person_id: "p-1", customer_member_id: null, enrollment_agreement_id: null, is_primary: true, room_location_id: "t2" }),
        ];
        const s = await homeroomsOf(t);
        expect(s.subjectType).toBe("staff");
        expect(s.homerooms).toEqual([]);
        expect(s.staffPrimaryRoom).toBe("Toddler 2");
    });
});

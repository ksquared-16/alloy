/**
 * The roster's "Primary:" summary names the PRIMARY room — never a secondary's.
 *
 * Staging (3d9af50ba), Ava ZZQA1484F31612: primary proposal Toddler 2 (on the enrollment draft),
 * Before Care in Infant A (a proposed ledger row). The summary took the first row when no row was
 * primary and read "Primary: Infant A".
 */
import { describe, expect, it } from "vitest";

import { buildAssignmentRosterReadModel } from "@/lib/scheduling/roster/buildAssignmentRosterReadModel";

type Row = Record<string, unknown>;
const ORG = "org-1";
const SITE = "site-1";

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
                is: () => self,
                not: () => self,
                gte: () => self,
                lte: () => self,
                or: () => self,
                order: () => self,
                limit: () => self,
                range: () => self,
                maybeSingle: async () => ({ data: rows()[0] ?? null, error: null }),
                single: async () => ({ data: rows()[0] ?? null, error: null }),
                then: (resolve: (v: unknown) => unknown) => Promise.resolve({ data: rows(), error: null }).then(resolve),
            };
            return self;
        },
        rpc: async () => ({ data: [], error: null }),
    } as never;
}

function assignment(over: Row): Row {
    return {
        org_id: ORG, site_location_id: SITE, subject_type: "child", subject_person_id: null, enrollment_agreement_id: null,
        is_primary: false, operational_assignment_type_id: null, schedule_pattern_id: "p-bc", end_date: null,
        status: "planned", commitment_kind: "proposed", ...over,
    };
}

const base = (): Record<string, Row[]> => ({
    customer_members: [
        { id: "m-ava", org_id: ORG, first_name: "Ava", last_name: "ZZQA1484F31612", person_id: null },
        { id: "m-ben", org_id: ORG, first_name: "Ben", last_name: "Enrolled", person_id: null },
        { id: "m-cy", org_id: ORG, first_name: "Cy", last_name: "NoDraft", person_id: null },
    ],
    locations: [
        { id: "toddler-2", org_id: ORG, label: "Toddler 2" },
        { id: "infant-a", org_id: ORG, label: "Infant A" },
        { id: "preschool-1", org_id: ORG, label: "Preschool 1" },
    ],
    schedule_patterns: [{ id: "p-bc", org_id: ORG, weekdays: [1, 2, 3, 4, 5] }],
});

describe("roster Primary summary", () => {
    it("a pre-enrolment child's primary is its draft room — Toddler 2, not the Before Care room", async () => {
        const t = base();
        t.schedule_assignments = [assignment({ id: "bc", customer_member_id: "m-ava", room_location_id: "infant-a", start_date: "2026-11-23" })];
        t.process_instances = [
            { org_id: ORG, process_key: "enrollment", subject_id: "m-ava", created_at: "2026-10-01T00:00:00Z", metadata: { program_room_cohort_key: "toddler-2" } },
        ];
        const model = await buildAssignmentRosterReadModel(fakeSupabase(t), ORG, SITE, null);
        const ava = model.subjects.find((s) => s.customerMemberId === "m-ava")!;
        expect(ava.primaryRoom).toBe("Toddler 2");
        // The Before Care row keeps its own room on its own line.
        expect(ava.assignments.map((a) => [a.isPrimary, a.roomName])).toEqual([[false, "Infant A"]]);
    });

    it("an enrolled child's primary ROW wins, whatever else it holds", async () => {
        const t = base();
        t.child_enrollment_agreements = [{ id: "ag-ben", org_id: ORG, customer_member_id: "m-ben", person_id: null, site_location_id: SITE, status: "active" }];
        t.schedule_assignments = [
            assignment({ id: "ben-bc", customer_member_id: "m-ben", enrollment_agreement_id: "ag-ben", commitment_kind: "committed", room_location_id: "infant-a", start_date: "2026-09-01" }),
            assignment({ id: "ben-p", customer_member_id: "m-ben", enrollment_agreement_id: "ag-ben", commitment_kind: "committed", is_primary: true, room_location_id: "preschool-1", start_date: "2026-10-01" }),
        ];
        const model = await buildAssignmentRosterReadModel(fakeSupabase(t), ORG, SITE, null);
        expect(model.subjects.find((s) => s.customerMemberId === "m-ben")!.primaryRoom).toBe("Preschool 1");
    });

    it("no primary row and no draft room: no primary room is claimed (never the secondary's)", async () => {
        const t = base();
        t.schedule_assignments = [assignment({ id: "cy-bc", customer_member_id: "m-cy", room_location_id: "infant-a", start_date: "2026-11-23" })];
        const model = await buildAssignmentRosterReadModel(fakeSupabase(t), ORG, SITE, null);
        expect(model.subjects.find((s) => s.customerMemberId === "m-cy")!.primaryRoom).toBeNull();
    });
});

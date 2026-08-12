/**
 * Phase 3 certification — Combined Daily Roster.
 *
 * Proves the composition joins certified child expectations and certified staff
 * supply on room·date without either side losing its type, and that the staffing
 * verdict is derived, never asserted.
 */

import { describe, expect, it } from "vitest";

import { buildCombinedRoster } from "@/lib/roster/buildCombinedRoster";
import { createEmploymentMock, ORG_ID, OTHER_ORG_ID, SITE_ID } from "./mockEmploymentSupabase";

const ROOM_A = "room-a";
const ROOM_B = "room-b";
const PATTERN = "pattern-mf";
const DATE = "2026-08-17"; // Monday
const JANE = "person-jane";
const RAE = "person-rae";

function staffAssignment(over?: Record<string, unknown>) {
    return {
        id: "sa-jane",
        org_id: ORG_ID,
        subject_type: "staff",
        subject_person_id: JANE,
        customer_member_id: null,
        enrollment_agreement_id: null,
        site_location_id: SITE_ID,
        room_location_id: ROOM_A,
        schedule_pattern_id: PATTERN,
        commitment_kind: "committed",
        status: "active",
        is_primary: true,
        start_date: DATE,
        end_date: null,
        ...over,
    };
}

function childAssignment(over?: Record<string, unknown>) {
    return {
        id: "sa-child-1",
        org_id: ORG_ID,
        subject_type: "child",
        subject_person_id: null,
        customer_member_id: "cm-1",
        enrollment_agreement_id: "agr-1",
        site_location_id: SITE_ID,
        room_location_id: ROOM_A,
        schedule_pattern_id: PATTERN,
        commitment_kind: "committed",
        status: "active",
        is_primary: true,
        start_date: DATE,
        end_date: null,
        ...over,
    };
}

/**
 * The roster composes real read models; this mock supplies the rows they read.
 * `buildScheduleExpectations` is the certified child engine — it is NOT stubbed.
 */
function rosterMock(over?: Record<string, Record<string, unknown>[]>) {
    return createEmploymentMock({
        persons: [
            { id: JANE, org_id: ORG_ID, full_name: "Jane Wilson", archived_at: null },
            { id: RAE, org_id: ORG_ID, full_name: "Rae Lindqvist", archived_at: null },
            { id: "person-child-1", org_id: ORG_ID, full_name: "Emma Smith", archived_at: null },
            { id: "person-child-2", org_id: ORG_ID, full_name: "Joe Smith", archived_at: null },
        ],
        employments: [
            {
                id: "emp-jane",
                org_id: ORG_ID,
                person_id: JANE,
                employment_status: "active",
                start_date: "2026-01-01",
                end_date: null,
                position_id: "pos-lead",
            },
            {
                id: "emp-rae",
                org_id: ORG_ID,
                person_id: RAE,
                employment_status: "active",
                start_date: "2026-01-01",
                end_date: null,
                position_id: null,
            },
        ],
        employment_positions: [{ id: "pos-lead", org_id: ORG_ID, label: "Lead Teacher" }],
        locations: [
            { id: SITE_ID, org_id: ORG_ID, label: "Riverside", location_type: "site" },
            { id: ROOM_A, org_id: ORG_ID, label: "Toddler Room A", location_type: "unit", parent_location_id: SITE_ID },
            { id: ROOM_B, org_id: ORG_ID, label: "Infant Room B", location_type: "unit", parent_location_id: SITE_ID },
        ],
        schedule_patterns: [
            { id: PATTERN, org_id: ORG_ID, site_location_id: SITE_ID, weekdays: [1, 2, 3, 4, 5], schedule_type_key: "full_time", metadata: {} },
        ],
        customer_members: [
            { id: "cm-1", org_id: ORG_ID, person_id: "person-child-1", display_name: "Emma Smith" },
            { id: "cm-2", org_id: ORG_ID, person_id: "person-child-2", display_name: "Joe Smith" },
        ],
        child_enrollment_agreements: [
            { id: "agr-1", org_id: ORG_ID, customer_member_id: "cm-1", person_id: "person-child-1", site_location_id: SITE_ID, status: "active", start_date: "2026-01-01", end_date: null },
            { id: "agr-2", org_id: ORG_ID, customer_member_id: "cm-2", person_id: "person-child-2", site_location_id: SITE_ID, status: "active", start_date: "2026-01-01", end_date: null },
        ],
        child_placements: [
            { id: "pl-1", org_id: ORG_ID, enrollment_agreement_id: "agr-1", customer_member_id: "cm-1", site_location_id: SITE_ID, room_location_id: ROOM_A, program_category_id: null, start_date: "2026-01-01", end_date: null, status: "active" },
            { id: "pl-2", org_id: ORG_ID, enrollment_agreement_id: "agr-2", customer_member_id: "cm-2", site_location_id: SITE_ID, room_location_id: ROOM_A, program_category_id: null, start_date: "2026-01-01", end_date: null, status: "active" },
        ],
        schedule_assignments: [
            childAssignment(),
            childAssignment({ id: "sa-child-2", customer_member_id: "cm-2", enrollment_agreement_id: "agr-2" }),
            staffAssignment(),
            staffAssignment({ id: "sa-rae", subject_person_id: RAE }),
        ],
        ...over,
    });
}

describe("combined roster — mixed cell", () => {
    it("returns one cell per room with both populations typed and distinct", async () => {
        const m = rosterMock();
        const roster = await buildCombinedRoster(m.supabase, {
            orgId: ORG_ID,
            siteLocationId: SITE_ID,
            date: DATE,
        });

        const cell = roster.cells.find((c) => c.roomLocationId === ROOM_A);
        expect(cell).toBeDefined();
        expect(cell?.expectedChildCount).toBe(2);
        expect(cell?.scheduledStaffCount).toBe(2);

        // Types survive the join — this is the whole point of the composition.
        expect(cell?.children.every((c) => c.subjectType === "child")).toBe(true);
        expect(cell?.staff.every((s) => s.subjectType === "staff")).toBe(true);

        // Children carry child identity; staff carry person + employment identity.
        expect(cell?.children.map((c) => c.customerMemberId).sort()).toEqual(["cm-1", "cm-2"]);
        expect(cell?.staff.map((s) => s.personId).sort()).toEqual([JANE, RAE].sort());
        expect(cell?.staff.find((s) => s.personId === JANE)?.positionLabel).toBe("Lead Teacher");

        // No child field on a staff subject and vice versa.
        for (const s of cell?.staff ?? []) {
            expect(s).not.toHaveProperty("customerMemberId");
        }
        for (const c of cell?.children ?? []) {
            expect(c).not.toHaveProperty("assignmentId");
        }
    });

    it("carries the canonical record target for every subject", async () => {
        const m = rosterMock();
        const roster = await buildCombinedRoster(m.supabase, { orgId: ORG_ID, siteLocationId: SITE_ID, date: DATE });
        const cell = roster.cells.find((c) => c.roomLocationId === ROOM_A);
        // Child → person identity when it has one; staff → person id.
        expect(cell?.children.every((c) => Boolean(c.personId))).toBe(true);
        expect(cell?.staff.every((s) => Boolean(s.personId))).toBe(true);
    });

    it("does not attribute a roomless child to an arbitrary room", async () => {
        const m = rosterMock({
            child_placements: [
                { id: "pl-1", org_id: ORG_ID, enrollment_agreement_id: "agr-1", customer_member_id: "cm-1", site_location_id: SITE_ID, room_location_id: null, program_category_id: null, start_date: "2026-01-01", end_date: null, status: "active" },
            ],
            schedule_assignments: [childAssignment(), staffAssignment()],
        });
        const roster = await buildCombinedRoster(m.supabase, { orgId: ORG_ID, siteLocationId: SITE_ID, date: DATE });
        expect(roster.totals.expectedChildren).toBe(0);
    });
});

describe("combined roster — staffing verdict", () => {
    it("is unknown when no ratio configuration resolves, and never sufficient", async () => {
        const m = rosterMock();
        const roster = await buildCombinedRoster(m.supabase, { orgId: ORG_ID, siteLocationId: SITE_ID, date: DATE });
        const cell = roster.cells.find((c) => c.roomLocationId === ROOM_A);
        expect(cell?.requiredStaff).toBeNull();
        expect(cell?.staffingSufficiency).toBe("unknown");
        expect(cell?.staffingReason).toBe("no_ratio_configuration");
        // Site roll-up must not read as staffed on partial knowledge.
        expect(roster.staffingSufficiency).toBe("unknown");
        expect(roster.totals.requiredStaff).toBeNull();
    });

    it("counts rooms by verdict for the operator summary", async () => {
        const m = rosterMock();
        const roster = await buildCombinedRoster(m.supabase, { orgId: ORG_ID, siteLocationId: SITE_ID, date: DATE });
        expect(roster.totals.roomsUnknown).toBe(roster.cells.length);
        expect(roster.totals.roomsShort).toBe(0);
    });
});

describe("combined roster — effective dating", () => {
    it("excludes staff before their assignment starts and includes them on the start date", async () => {
        const m = rosterMock({
            schedule_assignments: [staffAssignment({ start_date: "2026-08-18", end_date: "2026-08-20" })],
        });

        const before = await buildCombinedRoster(m.supabase, { orgId: ORG_ID, siteLocationId: SITE_ID, date: "2026-08-17" });
        const onStart = await buildCombinedRoster(m.supabase, { orgId: ORG_ID, siteLocationId: SITE_ID, date: "2026-08-18" });
        const onEnd = await buildCombinedRoster(m.supabase, { orgId: ORG_ID, siteLocationId: SITE_ID, date: "2026-08-20" });
        const after = await buildCombinedRoster(m.supabase, { orgId: ORG_ID, siteLocationId: SITE_ID, date: "2026-08-21" });

        expect(before.totals.scheduledStaff).toBe(0);
        expect(onStart.totals.scheduledStaff).toBe(1);
        // End date is INCLUSIVE under canonical window semantics.
        expect(onEnd.totals.scheduledStaff).toBe(1);
        expect(after.totals.scheduledStaff).toBe(0);
    });

    it("does not rewrite past roster truth when a later assignment moves the room", async () => {
        const m = rosterMock({
            schedule_assignments: [
                staffAssignment({ id: "sa-old", room_location_id: ROOM_A, start_date: "2026-08-17", end_date: "2026-08-18" }),
                staffAssignment({ id: "sa-new", room_location_id: ROOM_B, start_date: "2026-08-19", end_date: null }),
            ],
        });
        const earlier = await buildCombinedRoster(m.supabase, { orgId: ORG_ID, siteLocationId: SITE_ID, date: "2026-08-17" });
        const later = await buildCombinedRoster(m.supabase, { orgId: ORG_ID, siteLocationId: SITE_ID, date: "2026-08-19" });

        expect(earlier.cells.find((c) => c.roomLocationId === ROOM_A)?.scheduledStaffCount).toBe(1);
        expect(earlier.cells.find((c) => c.roomLocationId === ROOM_B)?.scheduledStaffCount).toBe(0);
        expect(later.cells.find((c) => c.roomLocationId === ROOM_A)?.scheduledStaffCount).toBe(0);
        expect(later.cells.find((c) => c.roomLocationId === ROOM_B)?.scheduledStaffCount).toBe(1);
    });
});

describe("combined roster — scope", () => {
    it("excludes subjects from another organization", async () => {
        const m = rosterMock({
            schedule_assignments: [
                staffAssignment({ org_id: OTHER_ORG_ID }),
                childAssignment({ org_id: OTHER_ORG_ID }),
            ],
        });
        const roster = await buildCombinedRoster(m.supabase, { orgId: ORG_ID, siteLocationId: SITE_ID, date: DATE });
        expect(roster.totals.scheduledStaff).toBe(0);
        expect(roster.totals.expectedChildren).toBe(0);
    });

    it("excludes subjects from another site", async () => {
        const m = rosterMock({
            schedule_assignments: [staffAssignment({ site_location_id: "other-site" })],
        });
        const roster = await buildCombinedRoster(m.supabase, { orgId: ORG_ID, siteLocationId: SITE_ID, date: DATE });
        expect(roster.totals.scheduledStaff).toBe(0);
    });

    it("keeps a staff member in the room they are actually assigned to", async () => {
        const m = rosterMock({
            schedule_assignments: [
                staffAssignment({ id: "sa-jane", room_location_id: ROOM_A }),
                staffAssignment({ id: "sa-rae", subject_person_id: RAE, room_location_id: ROOM_B }),
            ],
        });
        const roster = await buildCombinedRoster(m.supabase, { orgId: ORG_ID, siteLocationId: SITE_ID, date: DATE });
        expect(roster.cells.find((c) => c.roomLocationId === ROOM_A)?.staff.map((s) => s.personId)).toEqual([JANE]);
        expect(roster.cells.find((c) => c.roomLocationId === ROOM_B)?.staff.map((s) => s.personId)).toEqual([RAE]);
    });

    it("surfaces site-level staff with no room rather than dropping them", async () => {
        const m = rosterMock({
            schedule_assignments: [staffAssignment({ room_location_id: null })],
        });
        const roster = await buildCombinedRoster(m.supabase, { orgId: ORG_ID, siteLocationId: SITE_ID, date: DATE });
        expect(roster.unroomedStaff.map((s) => s.personId)).toEqual([JANE]);
        expect(roster.unroomedStaff[0].subjectType).toBe("staff");
    });
});

describe("combined roster — batched reads", () => {
    it("does not issue a person lookup per subject", async () => {
        const m = rosterMock();
        await buildCombinedRoster(m.supabase, { orgId: ORG_ID, siteLocationId: SITE_ID, date: DATE });
        // 4 subjects across 2 populations must not produce 4 persons reads.
        // The roster batches: one persons read for children, one inside supply.
        const personReads = m.reads?.filter((r) => r === "persons").length ?? 0;
        expect(personReads).toBeLessThanOrEqual(3);
    });
});

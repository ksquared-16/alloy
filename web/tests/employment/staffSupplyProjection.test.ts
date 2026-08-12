/**
 * Phase 2 certification — Staff Supply projection.
 *
 * Proves the chain Person → Employment → staff schedule assignment → Supply,
 * and that supply is a different truth from demand.
 */

import { describe, expect, it } from "vitest";

import {
    employmentRowCoversDate,
    personIsEmployedOnFromRows,
} from "@/lib/employment/employmentCoverage";
import { buildAssignmentRosterReadModel } from "@/lib/scheduling/roster/buildAssignmentRosterReadModel";
import { buildStaffSupply, staffSupplyCellKey } from "@/lib/scheduling/supply/buildStaffSupply";
import {
    resolveStaffingSufficiency,
    rollUpStaffingSufficiency,
} from "@/lib/scheduling/supply/staffingSufficiency";
import { createEmploymentMock, ORG_ID, OTHER_ORG_ID, SITE_ID } from "./mockEmploymentSupabase";

const ROOM_A = "room-a";
const ROOM_B = "room-b";
const PATTERN_WEEKDAYS = "pattern-mf";
const JANE = "person-jane";

/** Mon 2026-08-17 … Sun 2026-08-23. Aug 16 is the Sunday before. */
const WEEK_START = "2026-08-17";
const WEEK_END = "2026-08-23";

function supplyMock(overrides?: Record<string, Record<string, unknown>[]>) {
    return createEmploymentMock({
        persons: [
            { id: JANE, org_id: ORG_ID, full_name: "Jane Wilson", archived_at: null },
            { id: "person-rae", org_id: ORG_ID, full_name: "Rae Lindqvist", archived_at: null },
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
        ],
        employment_positions: [{ id: "pos-lead", org_id: ORG_ID, label: "Lead Teacher" }],
        locations: [
            { id: SITE_ID, org_id: ORG_ID, label: "Riverside", location_type: "site" },
            { id: ROOM_A, org_id: ORG_ID, label: "Toddler Room A", location_type: "unit" },
            { id: ROOM_B, org_id: ORG_ID, label: "Infant Room B", location_type: "unit" },
        ],
        schedule_patterns: [
            { id: PATTERN_WEEKDAYS, org_id: ORG_ID, weekdays: [1, 2, 3, 4, 5], metadata: {} },
        ],
        schedule_assignments: [],
        ...overrides,
    });
}

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
        schedule_pattern_id: PATTERN_WEEKDAYS,
        commitment_kind: "committed",
        status: "active",
        is_primary: true,
        start_date: WEEK_START,
        end_date: null,
        ...over,
    };
}

// ---------------------------------------------------------------------------
// 1. Supply projection
// ---------------------------------------------------------------------------
describe("staff supply projection", () => {
    it("projects an employed, scheduled person exactly once as staff", async () => {
        const m = supplyMock({ schedule_assignments: [staffAssignment()] });

        const supply = await buildStaffSupply(m.supabase, {
            orgId: ORG_ID,
            siteLocationId: SITE_ID,
            dateStart: WEEK_START,
            dateEnd: WEEK_END,
        });

        expect(supply.members).toHaveLength(1);
        expect(supply.members[0]).toMatchObject({
            personId: JANE,
            displayName: "Jane Wilson",
            positionLabel: "Lead Teacher",
            roomLocationId: ROOM_A,
            roomName: "Toddler Room A",
        });

        const monday = supply.cells.find((c) => c.date === WEEK_START);
        expect(monday?.scheduledStaffCount).toBe(1);
        expect(monday?.scheduledStaff.map((s) => s.personId)).toEqual([JANE]);
    });

    it("never represents a staff member as a child or member subject", async () => {
        const m = supplyMock({ schedule_assignments: [staffAssignment()] });
        const roster = await buildAssignmentRosterReadModel(m.supabase, ORG_ID, SITE_ID);

        expect(roster.staffSubjectCount).toBe(1);
        const subject = roster.subjects.find((s) => s.subjectType === "staff");
        expect(subject).toBeDefined();
        expect(subject?.subjectKey).toBe(`staff:${JANE}`);
        expect(subject?.customerMemberId).toBeNull();
        expect(subject?.enrollmentAgreementId).toBeNull();
        expect(subject?.subjectName).toBe("Jane Wilson");
        expect(subject?.positionLabel).toBe("Lead Teacher");
    });

    it("does not duplicate a person who holds two assignments", async () => {
        const m = supplyMock({
            schedule_assignments: [
                staffAssignment(),
                staffAssignment({ id: "sa-jane-2", is_primary: false, room_location_id: ROOM_A }),
            ],
        });
        const supply = await buildStaffSupply(m.supabase, {
            orgId: ORG_ID,
            siteLocationId: SITE_ID,
            dateStart: WEEK_START,
            dateEnd: WEEK_END,
        });
        const monday = supply.cells.find(
            (c) => c.date === WEEK_START && c.roomLocationId === ROOM_A
        );
        expect(monday?.scheduledStaffCount).toBe(1);
    });
});

// ---------------------------------------------------------------------------
// 2. Mixed assignment ledger
// ---------------------------------------------------------------------------
describe("mixed child + staff assignment ledger", () => {
    it("projects both subject types without dropping staff or coercing them to child", async () => {
        const m = supplyMock({
            customer_members: [{ id: "cm-1", org_id: ORG_ID, person_id: "person-rae" }],
            child_enrollment_agreements: [
                {
                    id: "agr-1",
                    org_id: ORG_ID,
                    customer_member_id: "cm-1",
                    person_id: "person-rae",
                    site_location_id: SITE_ID,
                    status: "active",
                },
            ],
            schedule_assignments: [
                staffAssignment(),
                {
                    id: "sa-child",
                    org_id: ORG_ID,
                    subject_type: "child",
                    subject_person_id: null,
                    customer_member_id: "cm-1",
                    enrollment_agreement_id: "agr-1",
                    site_location_id: SITE_ID,
                    room_location_id: ROOM_A,
                    schedule_pattern_id: PATTERN_WEEKDAYS,
                    commitment_kind: "committed",
                    status: "active",
                    is_primary: true,
                    start_date: WEEK_START,
                    end_date: null,
                },
            ],
        });

        const roster = await buildAssignmentRosterReadModel(m.supabase, ORG_ID, SITE_ID);

        expect(roster.totalAssignments).toBe(2);
        expect(roster.subjects).toHaveLength(2);
        expect(roster.staffSubjectCount).toBe(1);

        const staff = roster.subjects.find((s) => s.subjectType === "staff");
        const child = roster.subjects.find((s) => s.subjectType === "child");

        // Staff keeps its own namespace and carries no child identity.
        expect(staff?.subjectKey).toBe(`staff:${JANE}`);
        expect(staff?.customerMemberId).toBeNull();

        // Child integrity is untouched — still member- and agreement-backed.
        expect(child?.customerMemberId).toBe("cm-1");
        expect(child?.enrollmentAgreementId).toBe("agr-1");
        expect(child?.subjectKey).toBe("agreement:agr-1");

        // No collision between the two namespaces.
        expect(staff?.subjectKey).not.toBe(child?.subjectKey);
    });

    it("still drops a malformed child row with no member — child integrity is not weakened", async () => {
        const m = supplyMock({
            schedule_assignments: [
                {
                    id: "sa-bad",
                    org_id: ORG_ID,
                    subject_type: "child",
                    subject_person_id: null,
                    customer_member_id: null,
                    enrollment_agreement_id: null,
                    site_location_id: SITE_ID,
                    room_location_id: ROOM_A,
                    schedule_pattern_id: PATTERN_WEEKDAYS,
                    commitment_kind: "committed",
                    status: "active",
                    is_primary: false,
                    start_date: WEEK_START,
                    end_date: null,
                },
            ],
        });
        const roster = await buildAssignmentRosterReadModel(m.supabase, ORG_ID, SITE_ID);
        expect(roster.subjects).toHaveLength(0);
    });
});

// ---------------------------------------------------------------------------
// 3. Demand vs supply  +  4. No fake readiness
// ---------------------------------------------------------------------------
describe("staffing sufficiency", () => {
    it("does not resolve as sufficient when supply is short of demand", () => {
        expect(resolveStaffingSufficiency({ requiredStaff: 2, scheduledStaffCount: 1 })).toBe("short");
    });

    it("resolves as sufficient when supply meets demand", () => {
        expect(resolveStaffingSufficiency({ requiredStaff: 2, scheduledStaffCount: 2 })).toBe("sufficient");
        expect(resolveStaffingSufficiency({ requiredStaff: 2, scheduledStaffCount: 3 })).toBe("sufficient");
    });

    it("reports no demand and no supply as IDLE, never as sufficient", () => {
        // A closed or empty room is mathematically satisfied, but rendering it
        // green makes an idle campus look uniformly healthy and buries the rooms
        // that actually need the director.
        expect(resolveStaffingSufficiency({ requiredStaff: 0, scheduledStaffCount: 0 })).toBe("idle");
    });

    it("is sufficient — not idle — when staff are present with no demand", () => {
        expect(resolveStaffingSufficiency({ requiredStaff: 0, scheduledStaffCount: 1 })).toBe("sufficient");
    });

    it("never rolls an all-idle site up to sufficient", () => {
        expect(rollUpStaffingSufficiency(["idle", "idle"])).toBe("idle");
        expect(rollUpStaffingSufficiency(["idle", "sufficient"])).toBe("sufficient");
        expect(rollUpStaffingSufficiency(["idle", "short"])).toBe("short");
        expect(rollUpStaffingSufficiency(["idle", "unknown"])).toBe("unknown");
    });

    it("returns unknown — never sufficient — when demand cannot be resolved", () => {
        // This is the replacement for `staffReady: true`. An unresolvable ratio
        // configuration must read as unknown, not as staffed.
        expect(resolveStaffingSufficiency({ requiredStaff: null, scheduledStaffCount: 5 })).toBe("unknown");
        expect(resolveStaffingSufficiency({ requiredStaff: null, scheduledStaffCount: 0 })).toBe("unknown");
    });

    it("returns unknown when supply was not evaluated", () => {
        expect(resolveStaffingSufficiency({ requiredStaff: 2, scheduledStaffCount: null })).toBe("unknown");
    });

    it("never rolls a partially-known week up to sufficient", () => {
        expect(rollUpStaffingSufficiency(["sufficient", "unknown"])).toBe("unknown");
        expect(rollUpStaffingSufficiency(["sufficient", "short"])).toBe("short");
        expect(rollUpStaffingSufficiency(["short", "unknown"])).toBe("short");
        expect(rollUpStaffingSufficiency(["sufficient", "sufficient"])).toBe("sufficient");
        expect(rollUpStaffingSufficiency([])).toBe("unknown");
    });
});

// ---------------------------------------------------------------------------
// 5. Effective dating
// ---------------------------------------------------------------------------
describe("effective dating", () => {
    it("does not schedule staff before the assignment start date", async () => {
        const m = supplyMock({
            schedule_assignments: [staffAssignment({ start_date: "2026-08-17", end_date: "2026-08-31" })],
        });

        // Aug 16 is the Sunday before the window opens.
        const before = await buildStaffSupply(m.supabase, {
            orgId: ORG_ID,
            siteLocationId: SITE_ID,
            dateStart: "2026-08-16",
            dateEnd: "2026-08-16",
        });
        expect(before.cells).toHaveLength(0);

        const onStart = await buildStaffSupply(m.supabase, {
            orgId: ORG_ID,
            siteLocationId: SITE_ID,
            dateStart: "2026-08-17",
            dateEnd: "2026-08-17",
        });
        expect(onStart.cells[0]?.scheduledStaffCount).toBe(1);
    });

    it("stops projecting supply after the assignment window closes", async () => {
        const m = supplyMock({
            schedule_assignments: [staffAssignment({ start_date: "2026-08-17", end_date: "2026-08-31" })],
        });
        const after = await buildStaffSupply(m.supabase, {
            orgId: ORG_ID,
            siteLocationId: SITE_ID,
            dateStart: "2026-09-01",
            dateEnd: "2026-09-04",
        });
        expect(after.cells).toHaveLength(0);
    });

    it("keeps historical supply readable after a later assignment supersedes", async () => {
        const m = supplyMock({
            schedule_assignments: [
                staffAssignment({ id: "sa-old", start_date: "2026-08-17", end_date: "2026-08-21", room_location_id: ROOM_A }),
                staffAssignment({ id: "sa-new", start_date: "2026-08-24", end_date: null, room_location_id: ROOM_B }),
            ],
        });

        const week1 = await buildStaffSupply(m.supabase, {
            orgId: ORG_ID,
            siteLocationId: SITE_ID,
            dateStart: "2026-08-17",
            dateEnd: "2026-08-21",
        });
        const week2 = await buildStaffSupply(m.supabase, {
            orgId: ORG_ID,
            siteLocationId: SITE_ID,
            dateStart: "2026-08-24",
            dateEnd: "2026-08-28",
        });

        // The historical week still projects the OLD room; the new assignment
        // did not rewrite it.
        expect(week1.cells.every((c) => c.roomLocationId === ROOM_A)).toBe(true);
        expect(week2.cells.every((c) => c.roomLocationId === ROOM_B)).toBe(true);
    });

    it("honours the schedule pattern's weekdays", async () => {
        const m = supplyMock({
            schedule_patterns: [{ id: PATTERN_WEEKDAYS, org_id: ORG_ID, weekdays: [1, 3], metadata: {} }],
            schedule_assignments: [staffAssignment()],
        });
        const supply = await buildStaffSupply(m.supabase, {
            orgId: ORG_ID,
            siteLocationId: SITE_ID,
            dateStart: WEEK_START,
            dateEnd: WEEK_END,
        });
        // Mon (17th) and Wed (19th) only.
        expect(supply.cells.map((c) => c.date).sort()).toEqual(["2026-08-17", "2026-08-19"]);
    });
});

// ---------------------------------------------------------------------------
// 6. Employment eligibility gates supply, not just writes
// ---------------------------------------------------------------------------
describe("employment eligibility in the projection", () => {
    it("drops supply on days the person is no longer employed", async () => {
        const m = supplyMock({
            employments: [
                {
                    id: "emp-jane",
                    org_id: ORG_ID,
                    person_id: JANE,
                    employment_status: "ended",
                    start_date: "2026-01-01",
                    end_date: "2026-08-19",
                    position_id: "pos-lead",
                },
            ],
            // An open-ended assignment written while she was employed.
            schedule_assignments: [staffAssignment({ start_date: "2026-08-17", end_date: null })],
        });

        const supply = await buildStaffSupply(m.supabase, {
            orgId: ORG_ID,
            siteLocationId: SITE_ID,
            dateStart: WEEK_START,
            dateEnd: WEEK_END,
        });

        // Mon 17, Tue 18, Wed 19 are employed days. Thu 20 and Fri 21 are not.
        expect(supply.cells.map((c) => c.date)).toEqual(["2026-08-17", "2026-08-18", "2026-08-19"]);
    });

    it("projects no supply for a person with no employment at all", async () => {
        const m = supplyMock({
            employments: [],
            schedule_assignments: [staffAssignment()],
        });
        const supply = await buildStaffSupply(m.supabase, {
            orgId: ORG_ID,
            siteLocationId: SITE_ID,
            dateStart: WEEK_START,
            dateEnd: WEEK_END,
        });
        expect(supply.cells).toHaveLength(0);
    });

    it("coverage predicate mirrors person_is_employed_on window semantics", () => {
        const ended = {
            person_id: JANE,
            employment_status: "ended",
            start_date: "2026-01-01",
            end_date: "2026-06-30",
        };
        // Window-based, not status-based: an ended employment still covers its own days.
        expect(employmentRowCoversDate(ended, "2026-02-01")).toBe(true);
        expect(employmentRowCoversDate(ended, "2026-07-01")).toBe(false);
        expect(employmentRowCoversDate({ ...ended, employment_status: "canceled" }, "2026-02-01")).toBe(false);
        expect(personIsEmployedOnFromRows([ended], JANE, "2026-02-01")).toBe(true);
        expect(personIsEmployedOnFromRows([ended], "someone-else", "2026-02-01")).toBe(false);
    });
});

// ---------------------------------------------------------------------------
// 7. Tenancy / location scope
// ---------------------------------------------------------------------------
describe("tenancy and location scope", () => {
    it("does not leak scheduled staff across organizations", async () => {
        const m = supplyMock({
            schedule_assignments: [staffAssignment({ org_id: OTHER_ORG_ID })],
        });
        const supply = await buildStaffSupply(m.supabase, {
            orgId: ORG_ID,
            siteLocationId: SITE_ID,
            dateStart: WEEK_START,
            dateEnd: WEEK_END,
        });
        expect(supply.members).toHaveLength(0);
    });

    it("limits supply to the requested site", async () => {
        const m = supplyMock({
            schedule_assignments: [staffAssignment({ site_location_id: "other-site" })],
        });
        const supply = await buildStaffSupply(m.supabase, {
            orgId: ORG_ID,
            siteLocationId: SITE_ID,
            dateStart: WEEK_START,
            dateEnd: WEEK_END,
        });
        expect(supply.members).toHaveLength(0);
    });

    it("keys supply by room so a room filter resolves correctly", async () => {
        const m = supplyMock({
            persons: [
                { id: JANE, org_id: ORG_ID, full_name: "Jane Wilson", archived_at: null },
                { id: "person-rae", org_id: ORG_ID, full_name: "Rae Lindqvist", archived_at: null },
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
                    person_id: "person-rae",
                    employment_status: "active",
                    start_date: "2026-01-01",
                    end_date: null,
                    position_id: null,
                },
            ],
            schedule_assignments: [
                staffAssignment({ room_location_id: ROOM_A }),
                staffAssignment({
                    id: "sa-rae",
                    subject_person_id: "person-rae",
                    room_location_id: ROOM_B,
                }),
            ],
        });

        const supply = await buildStaffSupply(m.supabase, {
            orgId: ORG_ID,
            siteLocationId: SITE_ID,
            dateStart: WEEK_START,
            dateEnd: WEEK_START,
        });

        const roomA = supply.cells.find((c) => staffSupplyCellKey(c.roomLocationId, c.date) === staffSupplyCellKey(ROOM_A, WEEK_START));
        const roomB = supply.cells.find((c) => staffSupplyCellKey(c.roomLocationId, c.date) === staffSupplyCellKey(ROOM_B, WEEK_START));

        expect(roomA?.scheduledStaff.map((s) => s.personId)).toEqual([JANE]);
        expect(roomB?.scheduledStaff.map((s) => s.personId)).toEqual(["person-rae"]);
    });

    it("keeps site-level staff with no room visible as supply", async () => {
        const m = supplyMock({
            schedule_assignments: [staffAssignment({ room_location_id: null })],
        });
        const supply = await buildStaffSupply(m.supabase, {
            orgId: ORG_ID,
            siteLocationId: SITE_ID,
            dateStart: WEEK_START,
            dateEnd: WEEK_START,
        });
        expect(supply.members).toHaveLength(1);
        expect(supply.cells[0]?.roomLocationId).toBeNull();
        expect(supply.cells[0]?.scheduledStaffCount).toBe(1);
    });
});

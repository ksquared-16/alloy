/**
 * Replacing a secondary assignment never loses the commitment, never touches another subject's row,
 * and never writes a room outside the assignment's site (nor a non-classroom room for staff).
 *
 * Before: the prior row was closed, then the successor inserted, with nothing between them — an
 * insert refusal left the commitment closed and nothing in its place; and the prior row was found
 * by id alone.
 */
import { describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";

import { createOperationalAssignment } from "@/lib/operationalAssignments/operationalAssignmentService";
import {
    createOperationalEnrollmentMockStore,
    createOperationalEnrollmentMockSupabase,
    MEMBER_ID,
    ORG_ID,
    PATTERN_ID,
    seedOperationalEnrollmentFixtures,
    SITE_ID,
    UNIT_ID,
} from "../childcareOperational/mockOperationalEnrollmentSupabase";

const TODAY = "2026-07-24";
const LATER = "2026-08-03";
const OTHER_MEMBER = "member-2";

function seeded() {
    const base = seedOperationalEnrollmentFixtures();
    return createOperationalEnrollmentMockStore({
        ...base,
        customer_members: [...base.customer_members, { id: OTHER_MEMBER, org_id: ORG_ID, customer_id: "cust-2", person_id: "person-2" }],
        locations: [
            ...base.locations,
            { id: "site-2", org_id: ORG_ID, label: "North", location_type: "site" },
            { id: "unit-north", org_id: ORG_ID, label: "North Toddler", location_type: "unit", parent_location_id: "site-2" },
            { id: "unit-yard", org_id: ORG_ID, label: "Yard", location_type: "unit", unit_role: "shared_space", parent_location_id: SITE_ID },
        ],
        persons: [{ id: "staff-1", org_id: ORG_ID, archived_at: null }],
        employments: [
            { id: "emp-1", org_id: ORG_ID, person_id: "staff-1", employment_status: "active", start_date: "2026-01-01", end_date: null },
        ],
    });
}

const child = (memberId = MEMBER_ID) => ({ type: "child" as const, customerMemberId: memberId, siteLocationId: SITE_ID });

/** The real mock, with the schedule_assignments INSERT refused the way the consistency trigger would. */
function refusingInserts(supabase: SupabaseClient): SupabaseClient {
    return new Proxy(supabase, {
        get(target, prop, recv) {
            if (prop !== "from") return Reflect.get(target, prop, recv);
            return (table: string) => {
                const chain = target.from(table) as unknown as Record<string, unknown>;
                if (table !== "schedule_assignments") return chain;
                return new Proxy(chain, {
                    get(c, p, r) {
                        if (p !== "insert") return Reflect.get(c, p, r);
                        return () => ({
                            select: () => ({ single: async () => ({ data: null, error: { message: "assignment type does not support subject" } }) }),
                        });
                    },
                });
            };
        },
    }) as SupabaseClient;
}

async function secondary(supabase: SupabaseClient, memberId = MEMBER_ID) {
    return createOperationalAssignment(supabase, {
        orgId: ORG_ID,
        subject: child(memberId),
        schedulePatternId: PATTERN_ID,
        startDate: TODAY,
        roomLocationId: UNIT_ID,
        isPrimary: false,
        todayYmd: TODAY,
    });
}

describe("secondary replacement integrity", () => {
    it("a refused successor leaves the prior commitment live and unchanged", async () => {
        const store = seeded();
        const supabase = createOperationalEnrollmentMockSupabase(store);
        const prior = await secondary(supabase);

        await expect(
            createOperationalAssignment(refusingInserts(supabase), {
                orgId: ORG_ID,
                subject: child(),
                schedulePatternId: PATTERN_ID,
                startDate: LATER,
                isPrimary: false,
                supersedesAssignmentId: prior.id,
                todayYmd: TODAY,
            }),
        ).rejects.toMatchObject({ code: "db_error" });

        const rows = store.schedule_assignments;
        expect(rows).toHaveLength(1);
        expect(rows[0]).toMatchObject({ id: prior.id, status: prior.status, end_date: null });
    });

    it("a successful replacement closes the prior row the day before and links the successor", async () => {
        const store = seeded();
        const supabase = createOperationalEnrollmentMockSupabase(store);
        const prior = await secondary(supabase);
        const next = await createOperationalAssignment(supabase, {
            orgId: ORG_ID,
            subject: child(),
            schedulePatternId: PATTERN_ID,
            startDate: LATER,
            isPrimary: false,
            supersedesAssignmentId: prior.id,
            todayYmd: TODAY,
        });
        const byId = new Map(store.schedule_assignments.map((r) => [r.id, r]));
        expect(byId.get(prior.id)).toMatchObject({ status: "superseded", end_date: "2026-08-02" });
        expect(byId.get(next.id)).toMatchObject({ supersedes_assignment_id: prior.id, is_primary: false });
    });

    it("refuses to close ANOTHER child's row, and writes nothing", async () => {
        const store = seeded();
        const supabase = createOperationalEnrollmentMockSupabase(store);
        const theirs = await secondary(supabase, OTHER_MEMBER);
        await expect(
            createOperationalAssignment(supabase, {
                orgId: ORG_ID,
                subject: child(MEMBER_ID),
                schedulePatternId: PATTERN_ID,
                startDate: LATER,
                isPrimary: false,
                supersedesAssignmentId: theirs.id,
                todayYmd: TODAY,
            }),
        ).rejects.toMatchObject({ code: "not_found" });
        expect(store.schedule_assignments).toHaveLength(1);
        expect(store.schedule_assignments[0]).toMatchObject({ id: theirs.id, end_date: null });
    });

    it("a prior row someone else already superseded is a conflict, and the successor is removed", async () => {
        const store = seeded();
        const supabase = createOperationalEnrollmentMockSupabase(store);
        const prior = await secondary(supabase);
        // Another operator's replacement lands between this one's read and its close.
        const raced = new Proxy(supabase, {
            get(target, prop, recv) {
                if (prop !== "from") return Reflect.get(target, prop, recv);
                return (table: string) => {
                    const chain = target.from(table) as unknown as Record<string, unknown>;
                    if (table !== "schedule_assignments") return chain;
                    return new Proxy(chain, {
                        get(c, p, r) {
                            if (p === "update") {
                                const row = store.schedule_assignments.find((x) => x.id === prior.id)!;
                                row.status = "superseded";
                            }
                            return Reflect.get(c, p, r);
                        },
                    });
                };
            },
        }) as SupabaseClient;
        await expect(
            createOperationalAssignment(raced, {
                orgId: ORG_ID,
                subject: child(),
                schedulePatternId: PATTERN_ID,
                startDate: LATER,
                isPrimary: false,
                supersedesAssignmentId: prior.id,
                todayYmd: TODAY,
            }),
        ).rejects.toMatchObject({ code: "conflict" });
        expect(store.schedule_assignments.map((r) => r.id)).toEqual([prior.id]);
    });

    it("refuses a room that does not resolve to the assignment's site", async () => {
        const store = seeded();
        const supabase = createOperationalEnrollmentMockSupabase(store);
        await expect(
            createOperationalAssignment(supabase, {
                orgId: ORG_ID,
                subject: child(),
                schedulePatternId: PATTERN_ID,
                startDate: TODAY,
                roomLocationId: "unit-north",
                isPrimary: false,
                todayYmd: TODAY,
            }),
        ).rejects.toMatchObject({ code: "validation_failed" });
        expect(store.schedule_assignments).toHaveLength(0);
    });

    it("a staff room must be a classroom; a child secondary in a shared space is not decided here", async () => {
        const store = seeded();
        const supabase = createOperationalEnrollmentMockSupabase(store);
        await expect(
            createOperationalAssignment(supabase, {
                orgId: ORG_ID,
                subject: { type: "staff", personId: "staff-1", siteLocationId: SITE_ID },
                schedulePatternId: PATTERN_ID,
                startDate: TODAY,
                roomLocationId: "unit-yard",
                todayYmd: TODAY,
            }),
        ).rejects.toMatchObject({ code: "validation_failed" });
        const staffInClassroom = await createOperationalAssignment(supabase, {
            orgId: ORG_ID,
            subject: { type: "staff", personId: "staff-1", siteLocationId: SITE_ID },
            schedulePatternId: PATTERN_ID,
            startDate: TODAY,
            roomLocationId: UNIT_ID, // a historical unit with no stored role reads as a classroom
            todayYmd: TODAY,
        });
        expect(staffInClassroom.room_location_id).toBe(UNIT_ID);
        const childInYard = await createOperationalAssignment(supabase, {
            orgId: ORG_ID,
            subject: child(),
            schedulePatternId: PATTERN_ID,
            startDate: TODAY,
            roomLocationId: "unit-yard",
            isPrimary: false,
            todayYmd: TODAY,
        });
        expect(childInYard.room_location_id).toBe("unit-yard");
    });
});

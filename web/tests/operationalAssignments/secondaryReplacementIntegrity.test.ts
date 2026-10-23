/**
 * Replacing a secondary assignment goes through ONE transactional database function, and a new
 * assignment never names a room outside its site (nor a non-classroom room for staff).
 *
 * The transaction itself (rollback, concurrency, replay, subject/org/site binding) is proven live in
 * tests/access/live/secondaryAssignmentReplacement.live.test.ts; this file proves the wiring.
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

/** The real mock, with the replacement function stubbed: records what the service asked and answers as told. */
function withReplaceRpc(supabase: SupabaseClient, answer: (args: Record<string, unknown>) => { data?: unknown; error?: { message: string } }) {
    const calls: Array<Record<string, unknown>> = [];
    const proxied = new Proxy(supabase, {
        get(target, prop, recv) {
            if (prop !== "rpc") return Reflect.get(target, prop, recv);
            return async (fn: string, args: Record<string, unknown>) => {
                if (fn !== "replace_secondary_schedule_assignment") return (target.rpc as (f: string, x: unknown) => unknown)(fn, args);
                calls.push(args);
                const r = answer(args);
                return { data: r.data ?? null, error: r.error ?? null };
            };
        },
    }) as SupabaseClient;
    return { proxied, calls };
}

describe("secondary replacement integrity", () => {
    /*
     * The transactional guarantees (rollback, concurrency, replay, subject/org/site binding) are proven
     * against a live database in tests/access/live/secondaryAssignmentReplacement.live.test.ts. Here:
     * the service sends the replacement to that one function — never a two-call write — with the
     * subject it resolved and a deterministic key, and speaks its refusals in the service vocabulary.
     */
    it("a replacement is ONE call to the transactional function, carrying the resolved subject and a stable key", async () => {
        const store = seeded();
        const supabase = createOperationalEnrollmentMockSupabase(store);
        const prior = await secondary(supabase);
        const { proxied, calls } = withReplaceRpc(supabase, (args) => ({
            data: { ok: true, replayed: false, successor: { id: "succ-1", supersedes_assignment_id: args.p_prior_assignment_id } },
        }));
        const input = {
            orgId: ORG_ID,
            subject: child(),
            schedulePatternId: PATTERN_ID,
            startDate: LATER,
            roomLocationId: UNIT_ID,
            isPrimary: false,
            supersedesAssignmentId: prior.id,
            todayYmd: TODAY,
        };
        const next = await createOperationalAssignment(proxied, input);
        await createOperationalAssignment(proxied, input);
        expect(next.id).toBe("succ-1");
        expect(calls).toHaveLength(2);
        expect(calls[0]).toMatchObject({
            p_org_id: ORG_ID,
            p_prior_assignment_id: prior.id,
            p_subject_type: "child",
            p_customer_member_id: MEMBER_ID,
            p_successor: { site_location_id: SITE_ID, start_date: LATER, room_location_id: UNIT_ID, status: "planned", commitment_kind: "proposed" },
        });
        // The same intent produces the same key, so a resubmission replays in the database.
        expect(calls[1]!.p_replacement_key).toBe(calls[0]!.p_replacement_key);
        // Nothing was written outside the function: the prior row is as it was.
        expect(store.schedule_assignments).toHaveLength(1);
        expect(store.schedule_assignments[0]).toMatchObject({ id: prior.id, end_date: null });
    });

    it("speaks the function's refusals in the service vocabulary", async () => {
        const store = seeded();
        const supabase = createOperationalEnrollmentMockSupabase(store);
        const prior = await secondary(supabase);
        const cases: Array<[string, string]> = [
            ["prior_not_found", "not_found"],
            ["primary_not_supported: x", "invalid_state"],
            ["stale_predecessor: x", "conflict"],
            ["site_mismatch: x", "validation_failed"],
            ["invalid_successor_start: x", "validation_failed"],
            ['new row violates check constraint "schedule_assignments_status_check"', "db_error"],
        ];
        for (const [message, code] of cases) {
            const { proxied } = withReplaceRpc(supabase, () => ({ error: { message } }));
            await expect(
                createOperationalAssignment(proxied, {
                    orgId: ORG_ID,
                    subject: child(),
                    schedulePatternId: PATTERN_ID,
                    startDate: LATER,
                    isPrimary: false,
                    supersedesAssignmentId: prior.id,
                    todayYmd: TODAY,
                }),
            ).rejects.toMatchObject({ code });
        }
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

    it("a staff room must be a classroom; a child uses a shared space only for its configured uses (V7-02a)", async () => {
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
        // An UNCONFIGURED shared space is not offered or accepted for a new child schedule.
        await expect(
            createOperationalAssignment(supabase, {
                orgId: ORG_ID,
                subject: child(),
                schedulePatternId: PATTERN_ID,
                startDate: TODAY,
                roomLocationId: "unit-yard",
                assignmentTypeId: "type-enrichment",
                isPrimary: false,
                todayYmd: TODAY,
            }),
        ).rejects.toMatchObject({ code: "validation_failed", details: { code: "space_uses_not_configured" } });
        // Configured for Enrichment: Enrichment is accepted, another use is refused.
        const yard = (store.locations as Array<Record<string, unknown>>).find((l) => l.id === "unit-yard")!;
        yard.metadata = { space_uses: ["type-enrichment"] };
        const childInYard = await createOperationalAssignment(supabase, {
            orgId: ORG_ID,
            subject: child(),
            schedulePatternId: PATTERN_ID,
            startDate: TODAY,
            roomLocationId: "unit-yard",
            assignmentTypeId: "type-enrichment",
            isPrimary: false,
            todayYmd: TODAY,
        });
        expect(childInYard.room_location_id).toBe("unit-yard");
        await expect(
            createOperationalAssignment(supabase, {
                orgId: ORG_ID,
                subject: child(),
                schedulePatternId: PATTERN_ID,
                startDate: TODAY,
                roomLocationId: "unit-yard",
                assignmentTypeId: "type-before-care",
                isPrimary: false,
                todayYmd: TODAY,
            }),
        ).rejects.toMatchObject({ code: "validation_failed", details: { code: "use_not_configured_for_space" } });
    });
});

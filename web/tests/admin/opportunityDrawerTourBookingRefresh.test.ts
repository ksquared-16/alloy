import { describe, expect, it } from "vitest";

import {
    patchOpportunityDrawerRecordAfterTourBooking,
    mergeOptimisticTourBookings,
    readOptimisticTourBookingFromOverview,
} from "@/lib/admin/opportunityDrawerTourBookingRefresh";

describe("patchOpportunityDrawerRecordAfterTourBooking", () => {
    it("updates status, mirror metadata, and refreshes operational attention in one patch", () => {
        const nowMs = Date.parse("2026-05-27T18:00:00.000Z");
        const prev = {
            id: "opp-1",
            org_id: "org-1",
            status_key: "contacted",
            created_at: "2026-05-01T12:00:00.000Z",
            updated_at: "2026-05-20T12:00:00.000Z",
            metadata: {
                next_follow_up_at: "2026-05-20T12:00:00.000Z",
            },
            customer_id: "cust-1",
            primary_person_id: "person-1",
            _operational_attention: {
                needs_attention: true,
                primary_reason: { code: "follow_up_date_passed", label: "Follow-up overdue" },
                reasons: [{ code: "follow_up_date_passed", label: "Follow-up overdue" }],
            },
            _operational_recommendation: {
                version: 1,
                title: "Follow-up commitment is overdue",
                stale_state_check: {
                    fingerprint_inputs: { primary_reason_code: "follow_up_date_passed" },
                },
            },
        };

        const next = patchOpportunityDrawerRecordAfterTourBooking(
            prev,
            {
                start_at: "2026-06-01T16:00:00.000Z",
                timezone: "America/Los_Angeles",
                status_key: "confirmed",
            },
            { nowMs }
        );

        expect(next.status_key).toBe("tour_scheduled");
        expect((next.metadata as { tour_date?: string }).tour_date).toBe("2026-06-01");
        expect((next.metadata as { tour_time?: string }).tour_time).toBe("09:00");
        expect((next.metadata as { tour_timezone?: string }).tour_timezone).toBe("America/Los_Angeles");
        const attn = next._operational_attention as { reasons?: { code: string }[]; primary_reason?: { code: string } | null };
        expect(attn?.reasons?.map((r) => r.code)).not.toContain("follow_up_date_passed");
        expect(attn?.primary_reason?.code).not.toBe("follow_up_date_passed");
    });

    it("uses mirror_override for immediate 9:00 AM local wall display", () => {
        const prev = {
            id: "opp-1",
            org_id: "org-1",
            status_key: "contacted",
            metadata: {},
            customer_id: "cust-1",
            primary_person_id: "person-1",
        };

        const next = patchOpportunityDrawerRecordAfterTourBooking(prev, {
            start_at: "2026-06-01T16:00:00.000Z",
            timezone: "America/Los_Angeles",
            status_key: "confirmed",
            mirror_override: { tour_date: "2026-06-01", tour_time: "09:00" },
            booking_id: "booking-1",
        });

        expect((next.metadata as { tour_date?: string }).tour_date).toBe("2026-06-01");
        expect((next.metadata as { tour_time?: string }).tour_time).toBe("09:00");
        expect(readOptimisticTourBookingFromOverview(next)?.start_at).toBe("2026-06-01T16:00:00.000Z");
    });

    it("mergeOptimisticTourBookings drops optimistic row once server matches", () => {
        const server = [{ id: "b1", start_at: "2026-06-01T16:00:00.000Z" }];
        const optimistic = { id: "opt", start_at: "2026-06-01T16:00:00.000Z" };
        expect(mergeOptimisticTourBookings(server, optimistic)).toEqual(server);
        expect(mergeOptimisticTourBookings([], optimistic)).toEqual([optimistic]);
    });
});

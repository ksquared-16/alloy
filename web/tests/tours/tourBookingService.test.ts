import { describe, expect, it, vi, beforeEach } from "vitest";
import { createTourBooking } from "@/lib/tours/bookings/tourBookingService";
import type { CreateTourBookingInput } from "@/lib/tours/bookings/types";

vi.mock("@/lib/tours/availability/computeAvailableTourSlots", () => ({
    computeAvailableTourSlots: vi.fn().mockResolvedValue([
        {
            startAt: "2026-05-11T14:00:00.000Z",
            endAt: "2026-05-11T15:00:00.000Z",
            timezone: "UTC",
            remainingCapacity: 1,
            ruleId: "rule-1",
            locationId: "loc-1",
            userId: null,
        },
    ]),
}));

vi.mock("@/lib/tours/events/tourLifecycleEvents", () => ({
    emitTourBookingLifecycleEvent: vi.fn().mockResolvedValue("evt"),
}));

vi.mock("@/lib/tours/opportunity/tourBookingOpportunityIntegration", () => ({
    applyTourBookingOpportunityIntegration: vi.fn().mockResolvedValue(undefined),
}));

import { computeAvailableTourSlots } from "@/lib/tours/availability/computeAvailableTourSlots";
import { emitTourBookingLifecycleEvent } from "@/lib/tours/events/tourLifecycleEvents";
import { applyTourBookingOpportunityIntegration } from "@/lib/tours/opportunity/tourBookingOpportunityIntegration";

describe("createTourBooking", () => {
    beforeEach(() => {
        vi.mocked(emitTourBookingLifecycleEvent).mockClear();
        vi.mocked(computeAvailableTourSlots).mockClear();
        vi.mocked(applyTourBookingOpportunityIntegration).mockClear();
    });

    function makeSupabaseForCreate(row: Record<string, unknown>) {
        const idChain = {
            eq: vi.fn().mockReturnThis(),
            in: vi.fn().mockReturnThis(),
            limit: vi.fn().mockResolvedValue({ data: [], error: null }),
        };
        const insertChain = {
            select: vi.fn().mockReturnThis(),
            single: vi.fn().mockResolvedValue({ data: row, error: null }),
        };
        return {
            from: vi.fn(() => ({
                select: vi.fn((cols?: string) => {
                    if (cols === "id") return idChain;
                    return insertChain;
                }),
                insert: vi.fn(() => insertChain),
            })),
        } as never;
    }

    it("inserts confirmed booking and emits tour_confirmed when approval not required", async () => {
        const row = {
            id: "b-new",
            org_id: "org-1",
            opportunity_id: "opp-1",
            location_id: "loc-1",
            primary_person_id: null,
            primary_contact_id: null,
            requested_by_user_id: null,
            start_at: "2026-05-11T14:00:00.000Z",
            end_at: "2026-05-11T15:00:00.000Z",
            timezone: "UTC",
            status_key: "confirmed",
            source: "admin",
            form_submission_id: null,
            form_public_link_id: null,
            canceled_at: null,
            canceled_by: null,
            cancel_reason: null,
            rescheduled_from_booking_id: null,
            metadata: {},
            created_at: "2026-05-11T12:00:00.000Z",
            updated_at: "2026-05-11T12:00:00.000Z",
        };
        const supabase = makeSupabaseForCreate(row);
        const input: CreateTourBookingInput = {
            orgId: "org-1",
            opportunityId: "opp-1",
            locationId: "loc-1",
            startAt: new Date("2026-05-11T14:00:00.000Z"),
            endAt: new Date("2026-05-11T15:00:00.000Z"),
            timezone: "UTC",
            source: "admin",
            approvalRequired: false,
        };
        const out = await createTourBooking(supabase, input);
        expect(out.status_key).toBe("confirmed");
        expect(emitTourBookingLifecycleEvent).toHaveBeenCalledWith(
            supabase,
            "tour_confirmed",
            expect.objectContaining({ id: "b-new" }),
            { previous_status_key: null },
            expect.anything()
        );
        expect(applyTourBookingOpportunityIntegration).toHaveBeenCalledWith(
            supabase,
            expect.objectContaining({ kind: "confirmed_mirror", booking: expect.objectContaining({ status_key: "confirmed" }) })
        );
        const applyOrder = vi.mocked(applyTourBookingOpportunityIntegration).mock.invocationCallOrder[0]!;
        const emitOrder = vi.mocked(emitTourBookingLifecycleEvent).mock.invocationCallOrder[0]!;
        expect(applyOrder).toBeLessThan(emitOrder);
        expect(computeAvailableTourSlots).toHaveBeenCalled();
    });

    it("requested initial skips slot validation and emits tour_requested", async () => {
        const row = {
            id: "b-req",
            org_id: "org-1",
            opportunity_id: "opp-1",
            location_id: "loc-1",
            primary_person_id: null,
            primary_contact_id: null,
            requested_by_user_id: null,
            start_at: "2026-05-12T14:00:00.000Z",
            end_at: "2026-05-12T15:00:00.000Z",
            timezone: "UTC",
            status_key: "requested",
            source: "public_link",
            form_submission_id: null,
            form_public_link_id: null,
            canceled_at: null,
            canceled_by: null,
            cancel_reason: null,
            rescheduled_from_booking_id: null,
            metadata: {},
            created_at: "2026-05-12T12:00:00.000Z",
            updated_at: "2026-05-12T12:00:00.000Z",
        };
        const supabase = makeSupabaseForCreate(row);
        await createTourBooking(supabase, {
            orgId: "org-1",
            opportunityId: "opp-1",
            locationId: "loc-1",
            startAt: new Date("2026-05-12T14:00:00.000Z"),
            endAt: new Date("2026-05-12T15:00:00.000Z"),
            timezone: "UTC",
            source: "public_link",
            approvalRequired: true,
            initialStatus: "requested",
        });
        expect(computeAvailableTourSlots).not.toHaveBeenCalled();
        expect(emitTourBookingLifecycleEvent).toHaveBeenCalledWith(
            supabase,
            "tour_requested",
            expect.objectContaining({ status_key: "requested" }),
            { previous_status_key: null },
            expect.anything()
        );
        expect(applyTourBookingOpportunityIntegration).not.toHaveBeenCalled();
    });
});

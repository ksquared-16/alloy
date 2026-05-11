import { describe, expect, it, vi, beforeEach } from "vitest";
import {
    applyTourBookingOpportunityIntegration,
    deriveTourMetadataMirrorFromBooking,
    TOUR_BOOKING_OPPORTUNITY_STATUS,
} from "@/lib/tours/opportunity/tourBookingOpportunityIntegration";
import type { TourBookingRow } from "@/lib/tours/bookings/types";

vi.mock("@/lib/opportunities/updateOpportunityStatusWithEvent", () => ({
    updateOpportunityStatusWithEvent: vi.fn().mockResolvedValue({ error: null }),
}));

vi.mock("@/lib/admin/statusTransitionRules", () => ({
    validateStatusTransition: vi.fn().mockResolvedValue({ ok: true }),
}));

vi.mock("@/lib/admin/statusDefinitionsResolve", () => ({
    assertAllowedStatusKey: vi.fn().mockResolvedValue({ ok: true }),
}));

import { updateOpportunityStatusWithEvent } from "@/lib/opportunities/updateOpportunityStatusWithEvent";
import { validateStatusTransition } from "@/lib/admin/statusTransitionRules";

function baseBooking(over: Partial<TourBookingRow>): TourBookingRow {
    return {
        id: "b-1",
        org_id: "org-1",
        opportunity_id: "opp-1",
        location_id: "loc-1",
        primary_person_id: null,
        primary_contact_id: null,
        requested_by_user_id: null,
        start_at: "2026-05-11T15:00:00.000Z",
        end_at: "2026-05-11T16:00:00.000Z",
        timezone: "America/Los_Angeles",
        status_key: "confirmed",
        source: "admin",
        form_submission_id: null,
        form_public_link_id: null,
        canceled_at: null,
        canceled_by: null,
        cancel_reason: null,
        rescheduled_from_booking_id: null,
        metadata: {},
        created_at: "2026-05-10T12:00:00.000Z",
        updated_at: "2026-05-10T12:00:00.000Z",
        ...over,
    };
}

function makeSupabase(opp: {
    id: string;
    org_id: string;
    status_key: string | null;
    metadata: Record<string, unknown>;
    work_unit_id: string | null;
}) {
    const chain = {
        eq: vi.fn().mockReturnThis(),
        maybeSingle: vi.fn().mockResolvedValue({ data: opp, error: null }),
    };
    const wuChain = {
        eq: vi.fn().mockReturnThis(),
        maybeSingle: vi.fn().mockResolvedValue({ data: { department_id: null }, error: null }),
    };
    return {
        from: vi.fn((table: string) => {
            if (table === "opportunities") {
                return { select: vi.fn(() => chain) };
            }
            if (table === "work_units") {
                return { select: vi.fn(() => wuChain) };
            }
            throw new Error(`unexpected table ${table}`);
        }),
    } as never;
}

describe("deriveTourMetadataMirrorFromBooking", () => {
    it("formats wall date/time in booking timezone (LA)", () => {
        const m = deriveTourMetadataMirrorFromBooking("2026-05-11T15:00:00.000Z", "America/Los_Angeles");
        expect(m.tour_date).toBe("2026-05-11");
        expect(m.tour_time).toBe("08:00");
    });

    it("falls back to UTC for invalid IANA", () => {
        const m = deriveTourMetadataMirrorFromBooking("2026-05-11T12:00:00.000Z", "Not/AZone");
        expect(m.tour_date).toBe("2026-05-11");
        expect(m.tour_time).toBe("12:00");
    });

    it("throws on invalid instant", () => {
        expect(() => deriveTourMetadataMirrorFromBooking("not-a-date", "UTC")).toThrow(RangeError);
    });
});

describe("applyTourBookingOpportunityIntegration", () => {
    beforeEach(() => {
        vi.mocked(updateOpportunityStatusWithEvent).mockClear();
        vi.mocked(validateStatusTransition).mockClear();
    });

    it("confirmed_mirror writes tour_date/tour_time and tour_scheduled", async () => {
        const booking = baseBooking({ status_key: "confirmed" });
        const supabase = makeSupabase({
            id: "opp-1",
            org_id: "org-1",
            status_key: "inquiry_received",
            metadata: { notes: "x" },
            work_unit_id: null,
        });
        await applyTourBookingOpportunityIntegration(supabase, { booking, kind: "confirmed_mirror" });
        expect(updateOpportunityStatusWithEvent).toHaveBeenCalledTimes(1);
        const arg = vi.mocked(updateOpportunityStatusWithEvent).mock.calls[0]![0];
        expect(arg.newStatusKey).toBe(TOUR_BOOKING_OPPORTUNITY_STATUS.scheduled);
        const md = (arg.additionalPatch?.metadata ?? {}) as Record<string, unknown>;
        expect(md.notes).toBe("x");
        expect(md.tour_date).toBe("2026-05-11");
        expect(md.tour_time).toBe("08:00");
        expect(arg.eventMetadata).toMatchObject({
            source: "tour_booking",
            booking_id: "b-1",
            status_key: "confirmed",
        });
    });

    it("reschedule_mirror uses same path as confirmed for firm booking", async () => {
        const booking = baseBooking({ status_key: "rescheduled", start_at: "2026-05-12T17:00:00.000Z" });
        const supabase = makeSupabase({
            id: "opp-1",
            org_id: "org-1",
            status_key: "tour_scheduled",
            metadata: { tour_date: "2026-05-11", tour_time: "08:00" },
            work_unit_id: null,
        });
        await applyTourBookingOpportunityIntegration(supabase, { booking, kind: "reschedule_mirror" });
        const md = (vi.mocked(updateOpportunityStatusWithEvent).mock.calls[0]![0].additionalPatch?.metadata ?? {}) as Record<string, unknown>;
        expect(md.tour_date).toBe("2026-05-12");
        expect(md.tour_time).toBe("10:00");
    });

    it("completed maps opportunity to tour_completed", async () => {
        const booking = baseBooking({ status_key: "completed" });
        const supabase = makeSupabase({
            id: "opp-1",
            org_id: "org-1",
            status_key: "tour_scheduled",
            metadata: { tour_date: "2026-05-11" },
            work_unit_id: null,
        });
        await applyTourBookingOpportunityIntegration(supabase, { booking, kind: "completed" });
        expect(updateOpportunityStatusWithEvent).toHaveBeenCalledWith(
            expect.objectContaining({ newStatusKey: TOUR_BOOKING_OPPORTUNITY_STATUS.completed })
        );
    });

    it("no_show maps opportunity to tour_no_show", async () => {
        const booking = baseBooking({ status_key: "no_show" });
        const supabase = makeSupabase({
            id: "opp-1",
            org_id: "org-1",
            status_key: "tour_scheduled",
            metadata: {},
            work_unit_id: null,
        });
        await applyTourBookingOpportunityIntegration(supabase, { booking, kind: "no_show" });
        expect(updateOpportunityStatusWithEvent).toHaveBeenCalledWith(
            expect.objectContaining({ newStatusKey: TOUR_BOOKING_OPPORTUNITY_STATUS.noShow })
        );
    });

    it("canceled is a no-op for opportunity writes", async () => {
        const booking = baseBooking({ status_key: "canceled" });
        const supabase = makeSupabase({
            id: "opp-1",
            org_id: "org-1",
            status_key: "tour_scheduled",
            metadata: {},
            work_unit_id: null,
        });
        await applyTourBookingOpportunityIntegration(supabase, { booking, kind: "canceled" });
        expect(updateOpportunityStatusWithEvent).not.toHaveBeenCalled();
    });

    it("confirmed_mirror skips when booking is not firm", async () => {
        const booking = baseBooking({ status_key: "pending_approval" });
        const supabase = makeSupabase({
            id: "opp-1",
            org_id: "org-1",
            status_key: "inquiry_received",
            metadata: {},
            work_unit_id: null,
        });
        await applyTourBookingOpportunityIntegration(supabase, { booking, kind: "confirmed_mirror" });
        expect(updateOpportunityStatusWithEvent).not.toHaveBeenCalled();
    });

    it("throws when validateStatusTransition blocks", async () => {
        vi.mocked(validateStatusTransition).mockResolvedValueOnce({ ok: false, message: "nope" });
        const booking = baseBooking({ status_key: "confirmed" });
        const supabase = makeSupabase({
            id: "opp-1",
            org_id: "org-1",
            status_key: "inquiry_received",
            metadata: {},
            work_unit_id: null,
        });
        await expect(applyTourBookingOpportunityIntegration(supabase, { booking, kind: "confirmed_mirror" })).rejects.toThrow(
            "opportunity transition blocked"
        );
        expect(updateOpportunityStatusWithEvent).not.toHaveBeenCalled();
    });
});

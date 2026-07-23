import { describe, expect, it, vi, beforeEach } from "vitest";
import {
    applyTourBookingOpportunityIntegration,
    deriveTourMetadataMirrorFromBooking,
} from "@/lib/tours/opportunity/tourBookingOpportunityIntegration";
import type { TourBookingRow } from "@/lib/tours/bookings/types";

vi.mock("@/lib/lifecycle/emitDomainLifecycleSignalEvent", () => ({
    emitDomainLifecycleSignalEvent: vi.fn().mockResolvedValue({ error: null }),
}));

import { emitDomainLifecycleSignalEvent } from "@/lib/lifecycle/emitDomainLifecycleSignalEvent";

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

/**
 * Mock that supports both the opportunity load (`select().eq().eq().maybeSingle()`) and the metadata
 * mirror write (`update(patch).eq().eq()`), capturing the update patch so tests can assert exactly
 * what is (and is NOT — e.g. `status_key`) written.
 */
function makeSupabase(opp: {
    id: string;
    org_id: string;
    status_key: string | null;
    metadata: Record<string, unknown>;
    work_unit_id: string | null;
}) {
    const captured: { patch: Record<string, unknown> | null } = { patch: null };
    const selectChain = {
        eq: vi.fn().mockReturnThis(),
        maybeSingle: vi.fn().mockResolvedValue({ data: opp, error: null }),
    };
    const updateChain = {
        eq: vi.fn(() => updateChain),
        then: (resolve: (v: { error: null }) => unknown) => resolve({ error: null }),
    };
    const supabase = {
        from: vi.fn((table: string) => {
            if (table === "opportunities") {
                return {
                    select: vi.fn(() => selectChain),
                    update: vi.fn((patch: Record<string, unknown>) => {
                        captured.patch = patch;
                        return updateChain;
                    }),
                };
            }
            throw new Error(`unexpected table ${table}`);
        }),
    } as never;
    return { supabase, captured };
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

describe("applyTourBookingOpportunityIntegration (post enrollment status-collapse)", () => {
    beforeEach(() => {
        vi.mocked(emitDomainLifecycleSignalEvent).mockClear();
    });

    it("confirmed_mirror mirrors tour_date/tour_time and emits the 'scheduled' signal — never writes status_key", async () => {
        const booking = baseBooking({ status_key: "confirmed" });
        const { supabase, captured } = makeSupabase({
            id: "opp-1",
            org_id: "org-1",
            status_key: "open",
            metadata: { notes: "x" },
            work_unit_id: null,
        });
        await applyTourBookingOpportunityIntegration(supabase, { booking, kind: "confirmed_mirror" });

        // Metadata mirror persisted, and — the regression guard for the tour_booking status defect —
        // the write patch NEVER contains status_key (the retired `tour_scheduled` write is gone).
        const md = (captured.patch?.metadata ?? {}) as Record<string, unknown>;
        expect(md.notes).toBe("x");
        expect(md.tour_date).toBe("2026-05-11");
        expect(md.tour_time).toBe("08:00");
        expect(captured.patch).not.toHaveProperty("status_key");

        expect(emitDomainLifecycleSignalEvent).toHaveBeenCalledWith(
            expect.objectContaining({
                domain: "tour_booking",
                signal: "scheduled",
                opportunityId: "opp-1",
                metadata: expect.objectContaining({ source: "tour_booking", booking_id: "b-1", status_key: "confirmed" }),
            }),
        );
    });

    it("reschedule_mirror mirrors the new wall date/time and signals 'scheduled'", async () => {
        const booking = baseBooking({ status_key: "rescheduled", start_at: "2026-05-12T17:00:00.000Z" });
        const { supabase, captured } = makeSupabase({
            id: "opp-1",
            org_id: "org-1",
            status_key: "open",
            metadata: { tour_date: "2026-05-11", tour_time: "08:00" },
            work_unit_id: null,
        });
        await applyTourBookingOpportunityIntegration(supabase, { booking, kind: "reschedule_mirror" });
        const md = (captured.patch?.metadata ?? {}) as Record<string, unknown>;
        expect(md.tour_date).toBe("2026-05-12");
        expect(md.tour_time).toBe("10:00");
        expect(captured.patch).not.toHaveProperty("status_key");
        expect(emitDomainLifecycleSignalEvent).toHaveBeenCalledWith(expect.objectContaining({ signal: "scheduled" }));
    });

    it("completed records the completed date and signals 'completed' — no status_key write", async () => {
        const booking = baseBooking({ status_key: "completed" });
        const { supabase, captured } = makeSupabase({
            id: "opp-1",
            org_id: "org-1",
            status_key: "open",
            metadata: { tour_date: "2026-05-11" },
            work_unit_id: null,
        });
        await applyTourBookingOpportunityIntegration(supabase, { booking, kind: "completed" });
        expect(captured.patch).not.toHaveProperty("status_key");
        expect(emitDomainLifecycleSignalEvent).toHaveBeenCalledWith(expect.objectContaining({ signal: "completed" }));
    });

    it("no_show signals 'no_show' — no status_key write", async () => {
        const booking = baseBooking({ status_key: "no_show" });
        const { supabase, captured } = makeSupabase({
            id: "opp-1",
            org_id: "org-1",
            status_key: "open",
            metadata: {},
            work_unit_id: null,
        });
        await applyTourBookingOpportunityIntegration(supabase, { booking, kind: "no_show" });
        expect(captured.patch).not.toHaveProperty("status_key");
        expect(emitDomainLifecycleSignalEvent).toHaveBeenCalledWith(expect.objectContaining({ signal: "no_show" }));
    });

    it("canceled emits the domain lifecycle signal without any opportunity write", async () => {
        const booking = baseBooking({ status_key: "canceled" });
        const { supabase, captured } = makeSupabase({
            id: "opp-1",
            org_id: "org-1",
            status_key: "open",
            metadata: {},
            work_unit_id: null,
        });
        await applyTourBookingOpportunityIntegration(supabase, { booking, kind: "canceled" });
        expect(captured.patch).toBeNull();
        expect(emitDomainLifecycleSignalEvent).toHaveBeenCalledWith(
            expect.objectContaining({ domain: "tour_booking", signal: "canceled", opportunityId: "opp-1" }),
        );
    });

    it("confirmed_mirror skips when the booking is not firm", async () => {
        const booking = baseBooking({ status_key: "pending_approval" });
        const { supabase, captured } = makeSupabase({
            id: "opp-1",
            org_id: "org-1",
            status_key: "open",
            metadata: {},
            work_unit_id: null,
        });
        await applyTourBookingOpportunityIntegration(supabase, { booking, kind: "confirmed_mirror" });
        expect(captured.patch).toBeNull();
        expect(emitDomainLifecycleSignalEvent).not.toHaveBeenCalled();
    });
});

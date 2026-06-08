import { describe, expect, it } from "vitest";
import { resolveOpportunityInquiryTourDateDisplay } from "@/lib/tours/opportunity/resolveOpportunityInquiryTourDateDisplay";
import type { TourBookingRow } from "@/lib/tours/bookings/types";

const baseBooking = (over: Partial<TourBookingRow>): TourBookingRow =>
    ({
        id: "b1",
        org_id: "o1",
        opportunity_id: "p1",
        location_id: "l1",
        primary_person_id: null,
        primary_contact_id: null,
        requested_by_user_id: null,
        start_at: "2026-06-15T18:00:00.000Z",
        end_at: "2026-06-15T18:30:00.000Z",
        timezone: "America/New_York",
        status_key: "confirmed",
        source: "admin",
        form_submission_id: null,
        form_public_link_id: null,
        canceled_at: null,
        canceled_by: null,
        cancel_reason: null,
        rescheduled_from_booking_id: null,
        metadata: {},
        created_at: "2026-01-01T00:00:00.000Z",
        updated_at: "2026-01-01T00:00:00.000Z",
        ...over,
    }) as TourBookingRow;

describe("resolveOpportunityInquiryTourDateDisplay", () => {
    it("prefers active booking wall fields over stale metadata", () => {
        const md = { tour_date: "2020-01-01", tour_time: "09:00" };
        const b = baseBooking({});
        const r = resolveOpportunityInquiryTourDateDisplay(md, [b]);
        expect(r.tourDate).toBe("2026-06-15");
        expect(r.tourTime).toBe("14:00");
    });

    it("uses metadata when there is no active booking (legacy manual)", () => {
        const md = { tour_date: "2025-12-01", tour_time: "10:30" };
        const r = resolveOpportunityInquiryTourDateDisplay(md, []);
        expect(r.tourDate).toBe("2025-12-01");
        expect(r.tourTime).toBe("10:30");
    });

    it("falls back to metadata when booking mirror derivation fails", () => {
        const md = { tour_date: "2025-12-01", tour_time: "10:30" };
        const b = baseBooking({ start_at: "not-a-date", timezone: "America/New_York" });
        const r = resolveOpportunityInquiryTourDateDisplay(md, [b]);
        expect(r.tourDate).toBe("2025-12-01");
        expect(r.tourTime).toBe("10:30");
    });
});

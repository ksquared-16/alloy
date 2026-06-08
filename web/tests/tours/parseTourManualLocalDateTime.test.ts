import { describe, expect, it } from "vitest";

import { parseTourManualLocalDateTime } from "@/lib/tours/bookings/parseTourManualLocalDateTime";
import { deriveTourMetadataMirrorFromBooking } from "@/lib/tours/opportunity/tourBookingOpportunityIntegration";
import { formatTourBookingInstantSiteLocal } from "@/lib/tours/opportunity/formatTourBookingSiteLocalDisplay";

describe("parseTourManualLocalDateTime", () => {
    it("interprets 9:00 AM wall time in America/Los_Angeles (not UTC)", () => {
        const { startAt, endAt, timezone } = parseTourManualLocalDateTime({
            tourDate: "2026-06-15",
            tourTime: "09:00",
            timezoneIana: "America/Los_Angeles",
            durationMinutes: 60,
        });
        expect(timezone).toBe("America/Los_Angeles");
        expect(startAt.toISOString()).toBe("2026-06-15T16:00:00.000Z");
        expect(endAt.toISOString()).toBe("2026-06-15T17:00:00.000Z");

        const mirror = deriveTourMetadataMirrorFromBooking(startAt.toISOString(), timezone);
        expect(mirror.tour_date).toBe("2026-06-15");
        expect(mirror.tour_time).toBe("09:00");

        const label = formatTourBookingInstantSiteLocal(startAt.toISOString(), timezone);
        expect(label).toMatch(/9:00 AM/);
        expect(label).not.toMatch(/2:00 AM/);
    });
});

import { describe, expect, it } from "vitest";
import { formatOpportunityTourQueueDisplays, resolveTourWallForQueuePreview } from "@/lib/tours/queue/opportunityQueueTourPreview";

describe("opportunityQueueTourPreview", () => {
    it("prefers active booking wall fields over metadata for queue display", () => {
        const md = { tour_date: "2020-01-01", tour_time: "09:00" };
        const booking = { start_at: "2026-06-15T18:00:00.000Z", timezone: "America/New_York" };
        const { tourQueueDisplay, tourContext } = formatOpportunityTourQueueDisplays(md, booking, "America/Los_Angeles");
        expect(tourQueueDisplay).toContain("(site time)");
        expect(tourContext).toMatch(/^Tour:/);
        expect(tourQueueDisplay).toContain("06/15/2026");
    });

    it("falls back to metadata when no booking (viewer tz)", () => {
        const md = { tour_date: "2025-08-01", tour_time: "14:30" };
        const { tourQueueDisplay } = formatOpportunityTourQueueDisplays(md, null, "America/Chicago");
        expect(tourQueueDisplay).toBeTruthy();
        expect(tourQueueDisplay).not.toContain("(site time)");
    });

    it("resolveTourWallForQueuePreview marks fromBooking only when booking applies", () => {
        const md = { tour_date: "2025-01-01", tour_time: "10:00" };
        expect(resolveTourWallForQueuePreview(md, null).fromBooking).toBe(false);
        expect(
            resolveTourWallForQueuePreview(md, { start_at: "2026-01-02T15:00:00.000Z", timezone: "UTC" }).fromBooking
        ).toBe(true);
    });
});

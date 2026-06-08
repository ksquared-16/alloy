import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
    TOUR_SLOT_PAGE_DAYS,
    formatTourSlotWindowRangeLabel,
    tourSlotWindowBoundsUtc,
} from "@/lib/tours/availability/tourSlotWindowPagination";

describe("tourSlotWindowPagination", () => {
    beforeEach(() => {
        vi.useFakeTimers();
        vi.setSystemTime(new Date("2026-05-10T15:30:00.000Z"));
    });
    afterEach(() => {
        vi.useRealTimers();
    });

    it("page 0 is a fixed-length window starting at today 00:00 UTC", () => {
        const { from, to } = tourSlotWindowBoundsUtc(0);
        expect(from.toISOString()).toBe("2026-05-10T00:00:00.000Z");
        expect(to.toISOString()).toBe("2026-05-24T00:00:00.000Z");
        expect(to.getTime() - from.getTime()).toBe(TOUR_SLOT_PAGE_DAYS * 24 * 60 * 60 * 1000);
    });

    it("advances by pageDays per page index", () => {
        const a = tourSlotWindowBoundsUtc(1);
        expect(a.from.toISOString()).toBe("2026-05-24T00:00:00.000Z");
        expect(a.to.getTime() - a.from.getTime()).toBe(TOUR_SLOT_PAGE_DAYS * 24 * 60 * 60 * 1000);
    });

    it("each window span stays within API max (35 days)", () => {
        for (const page of [0, 1, 5, 26]) {
            const { from, to } = tourSlotWindowBoundsUtc(page);
            const days = (to.getTime() - from.getTime()) / (24 * 60 * 60 * 1000);
            expect(days).toBeLessThanOrEqual(35);
        }
    });

    it("formatTourSlotWindowRangeLabel covers inclusive UTC calendar display", () => {
        const from = new Date("2026-05-10T00:00:00.000Z");
        const to = new Date("2026-05-24T00:00:00.000Z");
        const label = formatTourSlotWindowRangeLabel(from, to, "en-US");
        expect(label).toMatch(/May 10/);
        expect(label).toMatch(/May 23/);
    });
});

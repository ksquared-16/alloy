/**
 * Month navigation for the parent tour calendar.
 *
 * The visitor could not reach September. The cause was not a missing button — it was that the
 * displayed month had no identity: it was derived from the selected day, so "next month" had
 * nothing to change. And availability was fetched once for a rolling 21-day window, which is
 * the invitation's OFFER window, not a month — so the back half of the displayed month was
 * blank even when times existed there.
 *
 * These cover the month arithmetic and the query window. The boundary that matters is the
 * backward one: a parent cannot tour in a month that has ended. There is deliberately no
 * forward horizon asserted here, because the platform has none — the only canonical bound is
 * `TOUR_PUBLIC_SLOTS_MAX_RANGE_MS`, a 45-day cap on a single query, which one month can never
 * exceed. Inventing a forward horizon would be inventing policy.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";

import {
    buildTourCalendarWeeks,
    isTourMonthInPast,
    shiftTourMonthKey,
    tourMonthAnchorDay,
    tourMonthKeyOf,
    tourMonthSlotsWindow,
} from "@/lib/tours/public/tourParentView";
import { TOUR_PUBLIC_SLOTS_MAX_RANGE_MS } from "@/lib/tours/public/tourPublicSlotsWindow";

describe("month keys", () => {
    it("derives the month from a day key", () => {
        expect(tourMonthKeyOf("2026-08-14")).toBe("2026-08");
        expect(tourMonthAnchorDay("2026-08")).toBe("2026-08-01");
    });

    it("moves August -> September -> October", () => {
        expect(shiftTourMonthKey("2026-08", 1)).toBe("2026-09");
        expect(shiftTourMonthKey("2026-09", 1)).toBe("2026-10");
    });

    it("moves backwards correctly", () => {
        expect(shiftTourMonthKey("2026-09", -1)).toBe("2026-08");
        expect(shiftTourMonthKey("2026-08", -1)).toBe("2026-07");
    });

    it("rolls the year at both boundaries", () => {
        expect(shiftTourMonthKey("2026-12", 1)).toBe("2027-01");
        expect(shiftTourMonthKey("2026-01", -1)).toBe("2025-12");
    });

    it("survives repeated navigation without drift", () => {
        let k = "2026-08";
        for (let i = 0; i < 30; i += 1) k = shiftTourMonthKey(k, 1);
        expect(k).toBe("2029-02");
        for (let i = 0; i < 30; i += 1) k = shiftTourMonthKey(k, -1);
        expect(k).toBe("2026-08");
    });
});

describe("the backward booking boundary", () => {
    const now = new Date("2026-08-26T12:00:00Z");

    it("treats a finished month as past", () => {
        expect(isTourMonthInPast("2026-07", now)).toBe(true);
    });

    it("does NOT treat the current month as past — the rest of this month is bookable", () => {
        expect(isTourMonthInPast("2026-08", now)).toBe(false);
    });

    it("does not treat future months as past", () => {
        expect(isTourMonthInPast("2026-09", now)).toBe(false);
        expect(isTourMonthInPast("2027-01", now)).toBe(false);
    });
});

describe("the per-month availability query", () => {
    it("covers the whole month", () => {
        const { from, to } = tourMonthSlotsWindow("2026-09");
        expect(from.toISOString() < "2026-09-01T00:00:00.000Z").toBe(true);
        expect(to.toISOString() > "2026-09-30T23:59:59.000Z").toBe(true);
    });

    it("pads each side, because slots are grouped by the CENTRE's local day", () => {
        // Without the pad a centre east or west of UTC loses its first or last day.
        const { from, to } = tourMonthSlotsWindow("2026-09");
        expect(from.toISOString().slice(0, 10)).toBe("2026-08-31");
        expect(to.toISOString().slice(0, 10)).toBe("2026-10-02");
    });

    it("never trips the canonical 45-day span guard, in any month", () => {
        for (const m of ["2026-01", "2026-02", "2026-04", "2026-07", "2026-12", "2028-02"]) {
            const { from, to } = tourMonthSlotsWindow(m);
            expect(to.getTime() - from.getTime(), m).toBeLessThanOrEqual(TOUR_PUBLIC_SLOTS_MAX_RANGE_MS);
        }
    });
});

describe("the grid follows the month, not the selection", () => {
    it("builds September from a September anchor even while an August day is selected", () => {
        const weeks = buildTourCalendarWeeks(tourMonthAnchorDay("2026-09"));
        const days = weeks.flat().filter(Boolean);
        expect(days[0]).toBe("2026-09-01");
        expect(days[days.length - 1]).toBe("2026-09-30");
        expect(days).not.toContain("2026-08-14");
    });

    it("renders a month with no availability as a real, navigable grid", () => {
        // A month with nothing configured must still draw, so the visitor can move past it.
        const weeks = buildTourCalendarWeeks(tourMonthAnchorDay("2027-03"));
        expect(weeks.flat().filter(Boolean)).toHaveLength(31);
    });
});

describe("the affordance itself", () => {
    // The repo has no React Testing Library and the component's calendar only exists after a
    // client effect fetches availability, so a render-and-click test is not available here.
    // These are structural instead: they pin the things a regression would silently remove.
    // Live desktop/mobile/keyboard certification is the hosted acceptance step, not this file.
    const SOURCE = readFileSync(join(process.cwd(), "app/tour-booking/[token]/TourBookingPublicClient.tsx"), "utf8");

    it("exposes accessible names on both controls", () => {
        expect(SOURCE).toContain('aria-label="Previous month"');
        expect(SOURCE).toContain('aria-label="Next month"');
    });

    it("uses real buttons, so keyboard activation and focus come for free", () => {
        const prev = SOURCE.slice(SOURCE.indexOf('aria-label="Previous month"') - 400, SOURCE.indexOf('aria-label="Previous month"'));
        expect(prev).toContain("<button");
        expect(prev).toContain('type="button"');
    });

    it("keeps the 44px tap target on the month controls", () => {
        // Same thumb-sized target the day cells already use.
        expect(SOURCE).toMatch(/aria-label="Previous month"[\s\S]{0,400}h-11 w-11/);
        expect(SOURCE).toMatch(/aria-label="Next month"[\s\S]{0,400}h-11 w-11/);
    });

    it("disables Previous at the boundary rather than hiding it", () => {
        expect(SOURCE).toContain("disabled={!canGoBack}");
        expect(SOURCE).toMatch(/disabled:pointer-events-none/);
    });

    it("changing month sets ONLY the month — it cannot select a date", () => {
        // The whole point: browsing is a viewing act. If either handler also touched `day` or
        // `pick`, navigating would silently pick a date for the parent.
        expect(SOURCE).toContain("onClick={() => setMonth(prevMonth)}");
        expect(SOURCE).toContain("onClick={() => setMonth(shiftTourMonthKey(displayedMonth, 1))}");
    });

    it("announces the month change to assistive tech", () => {
        expect(SOURCE).toMatch(/aria-live="polite"[\s\S]{0,200}formatParentMonthLabel/);
    });

    it("tells the truth about an empty month instead of fabricating slots", () => {
        expect(SOURCE).toContain("No times available this month.");
        expect(SOURCE).toContain("monthLoaded && !monthHasTimes");
    });
});

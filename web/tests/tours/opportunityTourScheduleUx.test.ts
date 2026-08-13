import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const comp = (name: string) => join(here, "..", "..", "components", "admin", "opportunity", "tours", name);

/**
 * Tour scheduling UX.
 *
 * The assertions that read `AdminEntityDrawer`, `OpportunityInquiryTourDateBlock` and
 * `OpportunityTourBookingLifecycleBar` are gone with those modules. The lifecycle bar was NOT
 * remounted: Current Work already groups the tour outcome commands
 * (`groupTourPresentationActions`), and the Tour card owns tour state — remounting the bar would
 * have been a second execution path for the same capability. What the bar knew and the card did not
 * is covered by `tests/focusPanel/tourCardLifecycle.test.ts`.
 */

describe("Opportunity tour schedule UX alignment", () => {
    it("header schedule action uses slot panel, duplicate guard, and legacy escape hatch", () => {
        const src = readFileSync(comp("OpportunityTourScheduleActionModal.tsx"), "utf8");
        expect(src).toContain("OpportunityTourSlotSchedulePanel");
        expect(src).toContain("/api/admin/tours/opportunities/");
        expect(src).toContain("active_bookings");
        expect(src).toContain("duplicate_guard");
        expect(src).toContain("Reschedule tour");
        expect(src).toContain("legacy");
    });

    it("slot panel is calendar-style (day tabs + time chips), not a long flat ul list", () => {
        const src = readFileSync(comp("OpportunityTourSlotSchedulePanel.tsx"), "utf8");
        expect(src).toContain('role="tablist"');
        expect(src).toContain('role="tab"');
        expect(src).toContain("slotsForSelectedDay");
        expect(src).toContain("selectedSlot.startAt");
        expect(src).not.toMatch(/<ul className=\"max-h-56 space-y-1/);
    });

    it("slot panel pages availability with next/prev and shared UTC window helper", () => {
        const src = readFileSync(comp("OpportunityTourSlotSchedulePanel.tsx"), "utf8");
        expect(src).toContain("rangePageIndex");
        expect(src).toContain("tourSlotWindowBoundsUtc");
        expect(src).toContain("formatTourSlotWindowRangeLabel");
        expect(src).toContain("Next →");
        expect(src).toContain("← Prev");
    });
});

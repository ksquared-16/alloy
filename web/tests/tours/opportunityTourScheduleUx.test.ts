import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const comp = (name: string) => join(here, "..", "..", "components", "admin", "opportunity", "tours", name);

const drawerPath = join(here, "..", "..", "components", "admin", "AdminEntityDrawer.tsx");

describe("Opportunity tour schedule UX alignment", () => {
    it("suppresses standalone tour_scheduling overview section (tour lives in inquiry summary)", () => {
        const drawer = readFileSync(drawerPath, "utf8");
        expect(drawer).toContain('s.key !== "tour_scheduling"');
        expect(drawer).not.toContain("out.tour_scheduling");
        expect(drawer).not.toContain("OpportunityTourDrawerSection");
    });

    it("inquiry summary uses OpportunityInquiryTourDateBlock for booking-backed Tour date", () => {
        const drawer = readFileSync(drawerPath, "utf8");
        expect(drawer).toContain("OpportunityInquiryTourDateBlock");
        const tourBlock = readFileSync(comp("OpportunityInquiryTourDateBlock.tsx"), "utf8");
        expect(tourBlock).toContain("formatTourBookingInstantSiteLocal");
    });

    it("header schedule action uses slot panel, duplicate guard, and legacy escape hatch", () => {
        const src = readFileSync(comp("OpportunityTourScheduleActionModal.tsx"), "utf8");
        expect(src).toContain("OpportunityTourSlotSchedulePanel");
        expect(src).toContain("/api/admin/tours/opportunities/");
        expect(src).toContain("active_bookings");
        expect(src).toContain("duplicate_guard");
        expect(src).toContain("Reschedule tour");
        expect(src).toContain("legacy");
    });

    it("lifecycle bar uses booking APIs for mutations", () => {
        const src = readFileSync(comp("OpportunityTourBookingLifecycleBar.tsx"), "utf8");
        expect(src).toContain("/api/admin/tours/bookings/");
        expect(src).toContain("OpportunityTourSlotSchedulePanel");
        expect(src).not.toContain("Tour date above follows this booking");
        expect(src).not.toContain('">Tour booking</div>');
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

    it("AdminEntityDrawer relabels schedule_tour header action when active bookings hook is wired", () => {
        const drawer = readFileSync(drawerPath, "utf8");
        expect(drawer).toContain("opportunityRecordHeaderActionsForUi");
        expect(drawer).toContain("Reschedule tour");
        expect(drawer).toContain("useOpportunityActiveTourBookings");
    });

    it("AdminEntityDrawer slot booking handler refreshes tour mirror, attention, and awaits cache-busted refetch", () => {
        const src = readFileSync(drawerPath, "utf8");
        expect(src).toContain("patchOpportunityDrawerRecordAfterTourBooking");
        expect(src).toContain("TOUR_BOOKING_OPPORTUNITY_STATUS.scheduled");
        expect(src).toContain("if (rf) await rf;");
        expect(src).toContain("cacheBust: true");
    });
});

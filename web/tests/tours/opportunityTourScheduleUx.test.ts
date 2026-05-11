import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const comp = (name: string) => join(here, "..", "..", "components", "admin", "opportunity", "tours", name);

describe("Opportunity tour schedule UX alignment", () => {
    it("drawer tour_scheduling section is summary-only (no duplicate slot schedule controls)", () => {
        const src = readFileSync(comp("OpportunityTourDrawerSection.tsx"), "utf8");
        expect(src).not.toContain("openSchedule");
        expect(src).not.toContain("postBookingAction");
        expect(src).toContain("Source of truth");
    });

    it("header schedule action uses slot panel + legacy escape hatch", () => {
        const src = readFileSync(comp("OpportunityTourScheduleActionModal.tsx"), "utf8");
        expect(src).toContain("OpportunityTourSlotSchedulePanel");
        expect(src).toContain("legacy");
    });

    it("lifecycle bar uses booking APIs for mutations", () => {
        const src = readFileSync(comp("OpportunityTourBookingLifecycleBar.tsx"), "utf8");
        expect(src).toContain("/api/admin/tours/bookings/");
        expect(src).toContain("OpportunityTourSlotSchedulePanel");
    });

    it("slot panel is calendar-style (day tabs + time chips), not a long flat ul list", () => {
        const src = readFileSync(comp("OpportunityTourSlotSchedulePanel.tsx"), "utf8");
        expect(src).toContain('role="tablist"');
        expect(src).toContain('role="tab"');
        expect(src).toContain("slotsForSelectedDay");
        expect(src).toContain("selectedSlot.startAt");
        expect(src).not.toMatch(/<ul className=\"max-h-56 space-y-1/);
    });
});

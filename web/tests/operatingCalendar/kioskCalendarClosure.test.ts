/**
 * The kiosk refuses a day the Operating Calendar closes, exactly as it refuses an
 * Attendance site closure — and refuses (unreadable) when the calendar cannot be read.
 */
import { describe, expect, it, vi } from "vitest";

const { calendarClosure } = vi.hoisted(() => ({ calendarClosure: vi.fn() }));

vi.mock("@/lib/operatingCalendar/operatingCalendarServer", () => ({
    loadCalendarSiteClosureForServiceDay: calendarClosure,
}));
vi.mock("@/lib/operationalExpectations/query/supabaseExpectationQueryGateway", () => ({
    createSupabaseExpectationQueryGateway: () => ({
        loadRowsForSubjects: async () => [],
        loadRatifications: async () => [],
    }),
}));

import { resolveKioskServiceDay } from "@/lib/childcareOperational/attendance/kiosk/kioskServiceDayGuard";

const params = { supabase: {} as never, orgId: "o", siteLocationId: "s", childId: "c", roomLocationId: "r", serviceDate: "2026-12-25" };

describe("kiosk service-day guard and the Operating Calendar", () => {
    it("a calendar closure is refused as closed", async () => {
        calendarClosure.mockResolvedValueOnce({ expectationId: "cal", reasonKey: "holiday_closure" });
        expect(await resolveKioskServiceDay(params)).toEqual({ operable: false, reason: "closed" });
    });

    it("an open calendar day stays operable", async () => {
        calendarClosure.mockResolvedValueOnce(null);
        expect(await resolveKioskServiceDay(params)).toEqual({ operable: true, interpretation: "normal" });
    });

    it("an unreadable calendar is refused, never assumed open", async () => {
        calendarClosure.mockRejectedValueOnce(new Error("down"));
        expect(await resolveKioskServiceDay(params)).toEqual({ operable: false, reason: "unreadable" });
    });
});

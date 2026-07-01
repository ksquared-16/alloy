import { describe, expect, it } from "vitest";
import {
    computeSlotsFromRulesAndBookings,
    dayOfWeekSun0FromUtc,
    parsePgTimeToParts,
    isSlotOffered,
} from "@/lib/tours/availability/internalCompute";
import type { TourAvailabilityRuleRow, TourBookingOverlapRow } from "@/lib/tours/availability/types";

describe("tour availability internalCompute", () => {
    /** Full UTC calendar day for 2026-05-11 — slot `from`/`to` are inclusive start bounds on the query window. */
    const utcDay20260511 = () => ({
        fromUtc: new Date(Date.UTC(2026, 4, 11, 0, 0, 0)),
        toUtc: new Date(Date.UTC(2026, 4, 12, 0, 0, 0)),
    });

    const baseRule = (over: Partial<TourAvailabilityRuleRow>): TourAvailabilityRuleRow => ({
        id: "rule-1",
        org_id: "org-1",
        location_id: "loc-1",
        user_id: null,
        day_of_week: 1,
        start_time: "09:00:00",
        end_time: "12:00:00",
        timezone: "UTC",
        slot_duration_minutes: 60,
        buffer_minutes: 0,
        max_bookings_per_slot: 1,
        approval_required: false,
        is_active: true,
        ...over,
    });

    it("parsePgTimeToParts handles HH:MM and HH:MM:SS", () => {
        expect(parsePgTimeToParts("9:30")).toEqual({ hours: 9, minutes: 30, seconds: 0 });
        expect(parsePgTimeToParts("09:30:15")).toEqual({ hours: 9, minutes: 30, seconds: 15 });
    });

    it("dayOfWeekSun0FromUtc: Monday in UTC", () => {
        const mon = new Date("2026-05-11T15:00:00.000Z");
        expect(dayOfWeekSun0FromUtc(mon, "UTC")).toBe(1);
    });

    it("generates full-hour slots Mon 9–12 UTC without buffer", () => {
        const rule = baseRule({ day_of_week: 1 });
        const { fromUtc, toUtc } = utcDay20260511();
        const slots = computeSlotsFromRulesAndBookings([rule], [], {
            locationId: "loc-1",
            fromUtc,
            toUtc,
            excludeBookingId: null,
        });
        expect(slots.map((s) => ({ start: s.startAt, end: s.endAt }))).toEqual([
            { start: "2026-05-11T09:00:00.000Z", end: "2026-05-11T10:00:00.000Z" },
            { start: "2026-05-11T10:00:00.000Z", end: "2026-05-11T11:00:00.000Z" },
            { start: "2026-05-11T11:00:00.000Z", end: "2026-05-11T12:00:00.000Z" },
        ]);
    });

    it("applies buffer as end-to-next-start", () => {
        const rule = baseRule({ buffer_minutes: 15, day_of_week: 1 });
        const { fromUtc, toUtc } = utcDay20260511();
        const slots = computeSlotsFromRulesAndBookings([rule], [], {
            locationId: "loc-1",
            fromUtc,
            toUtc,
            excludeBookingId: null,
        });
        expect(slots[0]!.startAt).toBe("2026-05-11T09:00:00.000Z");
        expect(slots[1]!.startAt).toBe("2026-05-11T10:15:00.000Z");
    });

    it("drops trailing partial slot", () => {
        const rule = baseRule({ end_time: "10:45:00", slot_duration_minutes: 60, day_of_week: 1 });
        const { fromUtc, toUtc } = utcDay20260511();
        const slots = computeSlotsFromRulesAndBookings([rule], [], {
            locationId: "loc-1",
            fromUtc,
            toUtc,
            excludeBookingId: null,
        });
        expect(slots).toHaveLength(1);
        expect(slots[0]!.endAt).toBe("2026-05-11T10:00:00.000Z");
    });

    it("blocks pending_approval, confirmed, rescheduled; not requested/canceled/completed/no_show", () => {
        const rule = baseRule({ day_of_week: 1, max_bookings_per_slot: 2 });
        const { fromUtc, toUtc } = utcDay20260511();
        const bookings: TourBookingOverlapRow[] = [
            {
                id: "b1",
                location_id: "loc-1",
                start_at: "2026-05-11T09:30:00.000Z",
                end_at: "2026-05-11T10:30:00.000Z",
                status_key: "requested",
            },
            {
                id: "b2",
                location_id: "loc-1",
                start_at: "2026-05-11T09:30:00.000Z",
                end_at: "2026-05-11T10:30:00.000Z",
                status_key: "pending_approval",
            },
        ];
        const slots = computeSlotsFromRulesAndBookings([rule], bookings, {
            locationId: "loc-1",
            fromUtc,
            toUtc,
            excludeBookingId: null,
        });
        const nine = slots.find((s) => s.startAt === "2026-05-11T09:00:00.000Z");
        expect(nine?.remainingCapacity).toBe(1);
        const bookingsCanceled: TourBookingOverlapRow[] = [
            {
                id: "b3",
                location_id: "loc-1",
                start_at: "2026-05-11T09:30:00.000Z",
                end_at: "2026-05-11T10:30:00.000Z",
                status_key: "canceled",
            },
        ];
        const slots2 = computeSlotsFromRulesAndBookings([rule], bookingsCanceled, {
            locationId: "loc-1",
            fromUtc,
            toUtc,
            excludeBookingId: null,
        });
        const nine2 = slots2.find((s) => s.startAt === "2026-05-11T09:00:00.000Z");
        expect(nine2?.remainingCapacity).toBe(2);
    });

    it("excludeBookingId removes that booking from overlap count (reschedule)", () => {
        const rule = baseRule({ day_of_week: 1, max_bookings_per_slot: 1 });
        const { fromUtc, toUtc } = utcDay20260511();
        const bookings: TourBookingOverlapRow[] = [
            {
                id: "self",
                location_id: "loc-1",
                start_at: "2026-05-11T09:00:00.000Z",
                end_at: "2026-05-11T10:00:00.000Z",
                status_key: "confirmed",
            },
        ];
        const without = computeSlotsFromRulesAndBookings([rule], bookings, {
            locationId: "loc-1",
            fromUtc,
            toUtc,
            excludeBookingId: null,
        });
        // Fully booked slots are omitted from the list (remainingCapacity would be 0).
        expect(
            isSlotOffered(
                without,
                { startAt: "2026-05-11T09:00:00.000Z", endAt: "2026-05-11T10:00:00.000Z", locationId: "loc-1" },
                1
            )
        ).toBe(false);
        const withEx = computeSlotsFromRulesAndBookings([rule], bookings, {
            locationId: "loc-1",
            fromUtc,
            toUtc,
            excludeBookingId: "self",
        });
        expect(
            isSlotOffered(
                withEx,
                { startAt: "2026-05-11T09:00:00.000Z", endAt: "2026-05-11T10:00:00.000Z", locationId: "loc-1" },
                1
            )
        ).toBe(true);
    });

    it("filters rules by userId when provided", () => {
        const r1 = baseRule({ id: "r1", user_id: "user-a", day_of_week: 1 });
        const r2 = baseRule({ id: "r2", user_id: null, day_of_week: 1, start_time: "14:00:00", end_time: "15:00:00" });
        const { fromUtc, toUtc } = utcDay20260511();
        const slots = computeSlotsFromRulesAndBookings([r1, r2], [], {
            locationId: "loc-1",
            userId: "user-a",
            fromUtc,
            toUtc,
            excludeBookingId: null,
        });
        expect(slots.every((s) => s.ruleId === "r1" || s.ruleId === "r2")).toBe(true);
        expect(slots.some((s) => s.ruleId === "r1")).toBe(true);
        const slotsOnlyA = computeSlotsFromRulesAndBookings([r1], [], {
            locationId: "loc-1",
            userId: "user-a",
            fromUtc,
            toUtc,
            excludeBookingId: null,
        });
        expect(slotsOnlyA.every((s) => s.ruleId === "r1")).toBe(true);
    });

    it("isSlotOffered matches exact window", () => {
        const slots = [
            {
                startAt: "2026-05-11T09:00:00.000Z",
                endAt: "2026-05-11T10:00:00.000Z",
                timezone: "UTC",
                remainingCapacity: 1,
                ruleId: "r",
                locationId: "loc-1",
                userId: null as string | null,
            },
        ];
        expect(
            isSlotOffered(slots, {
                startAt: "2026-05-11T09:00:00.000Z",
                endAt: "2026-05-11T10:00:00.000Z",
                locationId: "loc-1",
            })
        ).toBe(true);
        expect(
            isSlotOffered(slots, {
                startAt: "2026-05-11T09:15:00.000Z",
                endAt: "2026-05-11T10:15:00.000Z",
                locationId: "loc-1",
            })
        ).toBe(false);
    });

    it("DST: spring-forward Monday slots still align to wall clock in America/New_York", () => {
        const rule = baseRule({
            timezone: "America/New_York",
            day_of_week: 1,
            start_time: "09:00:00",
            end_time: "11:00:00",
        });
        const ref = new Date("2026-03-09T05:00:00.000Z");
        const slots = computeSlotsFromRulesAndBookings([rule], [], {
            locationId: "loc-1",
            fromUtc: ref,
            toUtc: new Date("2026-03-10T06:00:00.000Z"),
            excludeBookingId: null,
        });
        expect(slots.length).toBeGreaterThanOrEqual(1);
        expect(slots[0]!.timezone).toBe("America/New_York");
    });
});

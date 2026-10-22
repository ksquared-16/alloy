/**
 * S1-D — a booking being approved or moved does not count against itself, and excluding it
 * never makes any OTHER booking invisible.
 */
import { describe, expect, it } from "vitest";

import { computeSlotsFromRulesAndBookings, offeredSlotCapacity } from "@/lib/tours/availability/internalCompute";
import type { TourAvailabilityRuleRow, TourBookingOverlapRow } from "@/lib/tours/availability/types";
import { isTourSlotCapacityConflict, TOUR_SLOT_CAPACITY_EXCEEDED } from "@/lib/tours/bookings/tourSlotCapacity";

const LOC = "loc-1";
// Monday 2026-05-11, 09:00–10:00 UTC.
const SLOT = { startAt: "2026-05-11T09:00:00.000Z", endAt: "2026-05-11T10:00:00.000Z", locationId: LOC };

function rule(max: number): TourAvailabilityRuleRow {
    return {
        id: `rule-cap-${max}`,
        org_id: "org-1",
        location_id: LOC,
        user_id: null,
        day_of_week: 1,
        start_time: "09:00:00",
        end_time: "10:00:00",
        timezone: "UTC",
        slot_duration_minutes: 60,
        buffer_minutes: 0,
        max_bookings_per_slot: max,
        approval_required: true,
        is_active: true,
    };
}

function booking(id: string, status_key: string): TourBookingOverlapRow {
    return { id, location_id: LOC, start_at: SLOT.startAt, end_at: SLOT.endAt, status_key };
}

function capacityFor(rules: TourAvailabilityRuleRow[], bookings: TourBookingOverlapRow[], excludeBookingId: string | null) {
    const slots = computeSlotsFromRulesAndBookings(rules, bookings, {
        locationId: LOC,
        fromUtc: new Date("2026-05-11T08:55:00.000Z"),
        toUtc: new Date("2026-05-11T10:05:00.000Z"),
        excludeBookingId,
    });
    return offeredSlotCapacity(slots, SLOT);
}

describe("capacity self-exclusion", () => {
    it("a capacity-one slot holding only the pending booking being approved is NOT full for that booking", () => {
        const pending = booking("A", "pending_approval");
        // Without exclusion the pending booking fills its own slot — the D-T3 defect.
        expect(capacityFor([rule(1)], [pending], null)).toBeNull();
        // With it, the approval sees the seat it already holds.
        expect(capacityFor([rule(1)], [pending], "A")).toBe(1);
    });

    it("excluding the subject does not hide another booking: a second occupant still fills the slot", () => {
        const bookings = [booking("A", "pending_approval"), booking("B", "confirmed")];
        expect(capacityFor([rule(1)], bookings, "A")).toBeNull();
        expect(capacityFor([rule(2)], bookings, "A")).toBe(2);
        expect(capacityFor([rule(2)], [...bookings, booking("C", "rescheduled")], "A")).toBeNull();
    });

    it("non-consuming bookings never count", () => {
        const bookings = [booking("X", "canceled"), booking("Y", "requested"), booking("Z", "no_show")];
        expect(capacityFor([rule(1)], bookings, null)).toBe(1);
    });

    it("overlapping rules offer the most generous limit, matching the shared count", () => {
        expect(capacityFor([rule(1), rule(3)], [booking("B", "confirmed")], null)).toBe(3);
    });
});

describe("capacity conflict recognition", () => {
    it("recognises the database refusal through the transaction error message", () => {
        expect(isTourSlotCapacityConflict(new Error(`tour_bookings insert: ${TOUR_SLOT_CAPACITY_EXCEEDED}`))).toBe(true);
        expect(isTourSlotCapacityConflict(new Error("tour_bookings insert: duplicate key"))).toBe(false);
        expect(isTourSlotCapacityConflict(null)).toBe(false);
    });
});

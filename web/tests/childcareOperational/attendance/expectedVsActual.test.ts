import { describe, expect, it } from "vitest";
import { diffExpectedVsActual } from "@/lib/childcareOperational/attendance/expectedVsActual";
import type { ExpectedAttendanceEntry } from "@/lib/childcareOperational/expectations/scheduleExpectationCore";
import type { DayAttendanceSummary } from "@/lib/childcareOperational/attendance/attendanceFold";

function expected(p: Partial<ExpectedAttendanceEntry> = {}): ExpectedAttendanceEntry {
    return {
        date: "2026-06-15",
        weekday: 1,
        agreementId: "agr-1",
        customerMemberId: "mem-1",
        siteLocationId: "site-1",
        roomLocationId: "room-1",
        programCategoryId: "prog-1",
        schedulePatternId: "pat-1",
        scheduleTypeKey: "full_time",
        ...p,
    };
}

function summary(p: Partial<DayAttendanceSummary> = {}): DayAttendanceSummary {
    return {
        enrollmentAgreementId: "agr-1",
        customerMemberId: "mem-1",
        serviceDate: "2026-06-15",
        present: true,
        absent: false,
        checkInCount: 1,
        checkOutCount: 1,
        missingCheckout: false,
        firstCheckInAt: "2026-06-15T08:00:00Z",
        lastCheckOutAt: "2026-06-15T17:00:00Z",
        roomsObserved: ["room-1"],
        ...p,
    };
}

describe("diffExpectedVsActual", () => {
    it("matches expected + present with no variance", () => {
        const r = diffExpectedVsActual([expected()], [summary()]);
        expect(r.variances).toHaveLength(0);
        expect(r.matchedCount).toBe(1);
        expect(r.expectedCount).toBe(1);
        expect(r.actualPresentCount).toBe(1);
    });

    it("flags expected_not_checked_in when no facts exist", () => {
        const r = diffExpectedVsActual([expected()], []);
        expect(r.variances.map((v) => v.code)).toContain("expected_not_checked_in");
        expect(r.matchedCount).toBe(0);
    });

    it("flags absent", () => {
        const r = diffExpectedVsActual([expected()], [summary({ present: false, absent: true, checkInCount: 0, checkOutCount: 0, roomsObserved: [] })]);
        expect(r.variances.map((v) => v.code)).toEqual(["absent"]);
    });

    it("flags checked_in_not_expected", () => {
        const r = diffExpectedVsActual([], [summary()]);
        expect(r.variances.map((v) => v.code)).toEqual(["checked_in_not_expected"]);
    });

    it("flags late_arrival_unknown_time when present without timed check-in", () => {
        const r = diffExpectedVsActual([expected()], [summary({ checkInCount: 0, firstCheckInAt: null })]);
        expect(r.variances.map((v) => v.code)).toContain("late_arrival_unknown_time");
    });

    it("flags missing_checkout", () => {
        const r = diffExpectedVsActual([expected()], [summary({ checkOutCount: 0, missingCheckout: true, lastCheckOutAt: null })]);
        expect(r.variances.map((v) => v.code)).toContain("missing_checkout");
    });

    it("flags room_mismatch when observed rooms exclude expected room", () => {
        const r = diffExpectedVsActual([expected({ roomLocationId: "room-1" })], [summary({ roomsObserved: ["room-9"] })]);
        expect(r.variances.map((v) => v.code)).toContain("room_mismatch");
    });

    it("does not flag room_mismatch when expected room has no value", () => {
        const r = diffExpectedVsActual([expected({ roomLocationId: null })], [summary({ roomsObserved: ["room-9"] })]);
        expect(r.variances.map((v) => v.code)).not.toContain("room_mismatch");
    });
});

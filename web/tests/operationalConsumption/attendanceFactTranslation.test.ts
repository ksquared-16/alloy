import { describe, expect, it } from "vitest";
import { deriveAttendanceFactType } from "@/lib/operationalConsumption/attendanceFactTranslation";

/**
 * D12a §5.5 — the pure, UNWIRED event_kind → AttendanceFactType translation.
 * The 6 raw event_kinds do not map 1:1 to the 15 fact types; check_out is
 * context-sensitive by clock time. Malformed inputs → null, never throw.
 */
describe("deriveAttendanceFactType — exhaustive, context-sensitive", () => {
    it("check_in → check_in", () => {
        expect(deriveAttendanceFactType({ eventKind: "check_in" })).toBe("check_in");
    });

    it("check_out is context-sensitive by clock time vs the late threshold", () => {
        expect(deriveAttendanceFactType({ eventKind: "check_out", checkOutTime: "17:18", lateThresholdTime: "17:00" })).toBe("late_pickup");
        expect(deriveAttendanceFactType({ eventKind: "check_out", checkOutTime: "16:45", lateThresholdTime: "17:00" })).toBe("early_pickup");
        // exactly on time → no commercial candidate
        expect(deriveAttendanceFactType({ eventKind: "check_out", checkOutTime: "17:00", lateThresholdTime: "17:00" })).toBeNull();
    });

    it("check_out with malformed / missing times → null (never throws)", () => {
        expect(deriveAttendanceFactType({ eventKind: "check_out", checkOutTime: "nope", lateThresholdTime: "17:00" })).toBeNull();
        expect(deriveAttendanceFactType({ eventKind: "check_out", checkOutTime: null, lateThresholdTime: "17:00" })).toBeNull();
        expect(deriveAttendanceFactType({ eventKind: "check_out" })).toBeNull();
    });

    it("absence → absence regardless of vacation eligibility (interpreter decides the credit)", () => {
        expect(deriveAttendanceFactType({ eventKind: "absence", vacationEligible: true })).toBe("absence");
        expect(deriveAttendanceFactType({ eventKind: "absence", vacationEligible: false })).toBe("absence");
    });

    it("present → expected vs unexpected attendance", () => {
        expect(deriveAttendanceFactType({ eventKind: "present" })).toBe("expected_attendance");
        expect(deriveAttendanceFactType({ eventKind: "present", unexpected: true })).toBe("unexpected_attendance");
        expect(deriveAttendanceFactType({ eventKind: "present", unexpected: false, hours: 8 })).toBe("expected_attendance");
    });

    it("room_transfer and schedule_override carry no commercial candidate → null", () => {
        expect(deriveAttendanceFactType({ eventKind: "room_transfer" })).toBeNull();
        expect(deriveAttendanceFactType({ eventKind: "schedule_override" })).toBeNull();
    });
});

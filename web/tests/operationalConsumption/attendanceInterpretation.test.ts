import { describe, expect, it } from "vitest";
import { interpretAttendance, minutesBetween } from "@/lib/operationalConsumption/attendanceInterpretation";
import type { OperationalFactDto } from "@/lib/operationalConsumption/consumptionTypes";

function fact(over: Partial<OperationalFactDto> = {}): OperationalFactDto {
    return {
        eventKey: "",
        sourceFamily: "attendance",
        sourceEntityType: "child_attendance_events",
        sourceEntityId: "att-1",
        agreementId: "agr-1",
        ...over,
    };
}

describe("minutesBetween", () => {
    it("computes clock minutes and tolerates bad input", () => {
        expect(minutesBetween("17:00", "17:18")).toBe(18);
        expect(minutesBetween("17:00", "16:30")).toBe(-30);
        expect(minutesBetween(null, "17:18")).toBeNull();
        expect(minutesBetween("17:00", "oops")).toBeNull();
    });
});

describe("interpretAttendance — not every attendance fact is commercial", () => {
    it("check-out AFTER the late threshold → a late-pickup directive", () => {
        const r = interpretAttendance(fact({ attendanceFactType: "check_out", checkOutTime: "17:18", lateThresholdTime: "17:00" }));
        expect(r.directives).toHaveLength(1);
        expect(r.directives[0]).toMatchObject({ obligationKind: "late_pickup", eventKey: "attendance.late_pickup", scheduleBasis: null, draftable: true });
        expect(r.discardReason).toBeNull();
    });

    it("check-out BEFORE the late threshold → discarded (no event), explained", () => {
        const r = interpretAttendance(fact({ attendanceFactType: "check_out", checkOutTime: "16:30", lateThresholdTime: "17:00" }));
        expect(r.directives).toHaveLength(0);
        expect(r.discardReason).toMatch(/not after the 17:00 threshold/);
    });

    it("extra day / drop-in / extended day → drop-in-rate directives", () => {
        expect(interpretAttendance(fact({ attendanceFactType: "extra_day" })).directives[0]).toMatchObject({ obligationKind: "extra_day", scheduleBasis: "drop_in" });
        expect(interpretAttendance(fact({ attendanceFactType: "drop_in" })).directives[0]).toMatchObject({ obligationKind: "drop_in", scheduleBasis: "drop_in" });
        expect(interpretAttendance(fact({ attendanceFactType: "extended_day" })).directives[0]).toMatchObject({ obligationKind: "extended_day", scheduleBasis: "drop_in" });
    });

    it("hourly care carries the hours as a unit multiplier", () => {
        const r = interpretAttendance(fact({ attendanceFactType: "hourly_care", hours: 3 }));
        expect(r.directives[0]).toMatchObject({ obligationKind: "hourly_care", scheduleBasis: "hourly", draftable: true, unitMultiplier: 3 });
    });

    it("absence → vacation credit only when eligible, else discarded", () => {
        expect(interpretAttendance(fact({ attendanceFactType: "absence", vacationEligible: true })).directives[0]).toMatchObject({ obligationKind: "vacation_credit", draftable: false });
        const none = interpretAttendance(fact({ attendanceFactType: "absence", vacationEligible: false }));
        expect(none.directives).toHaveLength(0);
        expect(none.discardReason).toMatch(/no vacation-credit eligibility/);
    });

    it("no-show emits a directive (resolves to a charge only if a template exists)", () => {
        expect(interpretAttendance(fact({ attendanceFactType: "no_show" })).directives[0]).toMatchObject({ obligationKind: "no_show", eventKey: "attendance.no_show", draftable: true });
    });

    it("unexpected attendance → drop-in (extra day)", () => {
        expect(interpretAttendance(fact({ attendanceFactType: "unexpected_attendance" })).directives[0]).toMatchObject({ obligationKind: "extra_day", scheduleBasis: "drop_in" });
    });

    it.each(["room_transfer", "excused_absence", "early_pickup", "check_in", "attendance_duration", "expected_attendance"] as const)(
        "%s → discarded (no commercial impact), explained",
        (ft) => {
            const r = interpretAttendance(fact({ attendanceFactType: ft }));
            expect(r.directives).toHaveLength(0);
            expect(r.discardReason).toBeTruthy();
        },
    );
});

/**
 * Attendance interpretation engine (Operational Consumption, Slice 3) — PURE,
 * no DB / no IO. Attendance is the first consumer of the canonical Consumption
 * Pipeline. Operational Truth owns the raw attendance facts; this engine asks the
 * Consumption question: *does this attendance fact carry commercial significance,
 * and if so, what?*
 *
 * Core doctrine: NOT every attendance fact becomes a Consumption Event. A check-out
 * before the late threshold, an early pickup, a room transfer, an excused absence —
 * these are discarded with a reason. That decision belongs to the pipeline, not to
 * Attendance. Pricing/timing are resolved downstream by the existing Commercial
 * Model; this engine only decides *what should be commercially evaluated*.
 *
 * Doctrine: docs/platform/modules/operational-consumption-platform.md
 */

import type { AttendanceFactType, OperationalFactDto } from "@/lib/operationalConsumption/consumptionTypes";
import type { ConsumptionDirective } from "@/lib/operationalConsumption/scheduleInterpretation";

const TIME_RE = /^([0-2]?\d):([0-5]\d)$/;
const DEFAULT_LATE_THRESHOLD = "17:00";

/** Minutes between two HH:MM clock times (b - a); null if either is malformed. */
export function minutesBetween(a: string | null | undefined, b: string | null | undefined): number | null {
    if (!a || !b) return null;
    const ma = TIME_RE.exec(a.trim());
    const mb = TIME_RE.exec(b.trim());
    if (!ma || !mb) return null;
    return (Number(mb[1]) * 60 + Number(mb[2])) - (Number(ma[1]) * 60 + Number(ma[2]));
}

export type AttendanceInterpretation = {
    attendanceFactType: AttendanceFactType;
    directives: ConsumptionDirective[];
    /** Set when the fact is discarded (no Consumption Event), explaining why. */
    discardReason: string | null;
};

function discard(attendanceFactType: AttendanceFactType, reason: string): AttendanceInterpretation {
    return { attendanceFactType, directives: [], discardReason: reason };
}

function lateDirective(checkOut: string, threshold: string, minutesLate: number | null): ConsumptionDirective {
    const late = minutesLate != null ? ` (${minutesLate} min late)` : "";
    return {
        obligationKind: "late_pickup",
        eventKey: "attendance.late_pickup",
        scheduleBasis: null, // fixed-fee charge template
        draftable: true,
        reason: `Checked out at ${checkOut}, after the ${threshold} threshold${late} → late-pickup fee.`,
    };
}

/**
 * Interpret an attendance fact into zero-or-more obligation directives. Pure.
 * `attendanceFactType` defaults to "check_out" (the keystone late-pickup case).
 */
export function interpretAttendance(fact: OperationalFactDto): AttendanceInterpretation {
    const ft: AttendanceFactType = fact.attendanceFactType ?? "check_out";

    switch (ft) {
        case "late_pickup": {
            const threshold = fact.lateThresholdTime ?? DEFAULT_LATE_THRESHOLD;
            return { attendanceFactType: ft, directives: [lateDirective(fact.checkOutTime ?? "?", threshold, minutesBetween(threshold, fact.checkOutTime))], discardReason: null };
        }

        case "check_out": {
            const threshold = fact.lateThresholdTime ?? DEFAULT_LATE_THRESHOLD;
            const late = minutesBetween(threshold, fact.checkOutTime);
            if (fact.checkOutTime && late != null && late > 0) {
                return { attendanceFactType: ft, directives: [lateDirective(fact.checkOutTime, threshold, late)], discardReason: null };
            }
            return discard(ft, `Checked out at ${fact.checkOutTime ?? "?"}, not after the ${threshold} threshold → no late-pickup charge.`);
        }

        case "extra_day":
            return { attendanceFactType: ft, directives: [{ obligationKind: "extra_day", eventKey: "attendance.extra_day", scheduleBasis: "drop_in", draftable: true, reason: "Extra day beyond the recurring schedule → charged at the drop-in rate." }], discardReason: null };

        case "drop_in":
            return { attendanceFactType: ft, directives: [{ obligationKind: "drop_in", eventKey: "attendance.drop_in", scheduleBasis: "drop_in", draftable: true, reason: "Drop-in attendance → charged at the drop-in rate." }], discardReason: null };

        case "extended_day":
            return { attendanceFactType: ft, directives: [{ obligationKind: "extended_day", eventKey: "attendance.extended_day", scheduleBasis: "drop_in", draftable: true, reason: "Extended-day care → billed at the drop-in rate." }], discardReason: null };

        case "hourly_care": {
            const hours = fact.hours ?? null;
            return {
                attendanceFactType: ft,
                directives: [{ obligationKind: "hourly_care", eventKey: "attendance.hourly_care", scheduleBasis: "hourly", draftable: true, unitMultiplier: hours ?? 1, reason: `Hourly care${hours != null ? ` for ${hours}h` : ""} → billed at the hourly rate.` }],
                discardReason: null,
            };
        }

        case "no_show":
            // A no-show CAN be commercial, but only if a no-show fee is configured. The
            // pipeline resolves it to a charge when a template exists, else suppresses it.
            return { attendanceFactType: ft, directives: [{ obligationKind: "no_show", eventKey: "attendance.no_show", scheduleBasis: null, draftable: true, reason: "No-show → a fee applies only if the org configured a no-show charge template." }], discardReason: null };

        case "absence":
            if (fact.vacationEligible) {
                return { attendanceFactType: ft, directives: [{ obligationKind: "vacation_credit", eventKey: "attendance.vacation_credit", scheduleBasis: null, draftable: false, reason: "Absence with vacation-credit eligibility → a vacation credit (preview only; credits post downstream)." }], discardReason: null };
            }
            return discard(ft, "Absence with no vacation-credit eligibility → no commercial impact.");

        case "excused_absence":
            return discard(ft, "Excused absence → no charge.");

        case "room_transfer":
            return discard(ft, "Room transfer changes where the child is, not what is billed → no commercial impact unless configured.");

        case "early_pickup":
            return discard(ft, "Early pickup → no commercial impact (recurring tuition is unchanged).");

        case "check_in":
            return discard(ft, "Check-in alone carries no commercial meaning; billing follows from the schedule/duration.");

        case "attendance_duration":
            return discard(ft, "Attendance duration within the scheduled day carries no separate charge.");

        case "expected_attendance":
            return discard(ft, "Expected attendance is already priced by recurring tuition → no separate event.");

        case "unexpected_attendance":
            return { attendanceFactType: ft, directives: [{ obligationKind: "extra_day", eventKey: "attendance.extra_day", scheduleBasis: "drop_in", draftable: true, reason: "Unexpected attendance (not on the schedule) → charged at the drop-in rate." }], discardReason: null };

        default:
            return discard(ft, "Unrecognized attendance fact type → no commercial impact.");
    }
}

/**
 * Pure `event_kind → AttendanceFactType` translation (D12a, Section 5.5).
 *
 * The 6 raw attendance `event_kind`s do NOT map 1:1 to the 15 consumption
 * `AttendanceFactType`s, so this translation is CONTEXT-SENSITIVE (a `check_out`
 * resolves to late_pickup / early_pickup / on-time by clock time). It exists to
 * satisfy the RFC D12a requirement to define the translation explicitly.
 *
 * AUTHORED + UNIT-TESTED, but DELIBERATELY UNWIRED in Wave 1 — it has NO runtime
 * caller. D12b's future reactor will consume it to derive `attendanceFactType`
 * when re-fetching the authoritative attendance row. Malformed input → null,
 * never throws.
 *
 * Doctrine: RFC operational-expansion-phase1-architecture-rfc.md (D12a).
 */

import type { AttendanceEventKind } from "@/lib/childcareOperational/attendance/attendanceVocabulary";
import type { AttendanceFactType } from "@/lib/operationalConsumption/consumptionTypes";
import { minutesBetween } from "@/lib/operationalConsumption/attendanceInterpretation";

export type AttendanceFactTranslationInput = {
    eventKind: AttendanceEventKind;
    checkOutTime?: string | null;
    lateThresholdTime?: string | null;
    hours?: number | null;
    vacationEligible?: boolean | null;
    /** Whether the presence was NOT on the child's schedule (drives unexpected vs expected). */
    unexpected?: boolean | null;
};

/**
 * Derive the normalized commercial `AttendanceFactType` for a raw attendance
 * `event_kind`. Returns null when the raw kind carries no commercial candidate
 * (e.g. room_transfer, schedule_override) or when a check_out is on-time.
 */
export function deriveAttendanceFactType(input: AttendanceFactTranslationInput): AttendanceFactType | null {
    switch (input.eventKind) {
        case "check_in":
            return "check_in";

        case "check_out": {
            // Context-sensitive: compare the checkout time to the scheduled end of
            // care (the late threshold). Late → late_pickup; earlier → early_pickup;
            // exactly on time / missing inputs → no commercial candidate (null).
            const delta = minutesBetween(input.lateThresholdTime, input.checkOutTime);
            if (delta == null) return null; // malformed / missing times
            if (delta > 0) return "late_pickup";
            if (delta < 0) return "early_pickup";
            return null; // on time
        }

        case "absence":
            // The consumption interpreter decides vacation_credit from vacationEligible;
            // the raw fact type is simply "absence" either way.
            return "absence";

        case "present":
            return input.unexpected === true ? "unexpected_attendance" : "expected_attendance";

        case "room_transfer":
            return null; // changes where the child is, not what is billed

        case "schedule_override":
            return null; // a schedule mutation, not an attendance commercial candidate

        default:
            return null;
    }
}

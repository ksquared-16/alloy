/**
 * Attendance card evidence — "What was expected, what actually happened, what is happening now,
 * and does anything require correction?"
 *
 * ── THE CARD OWNS NO ATTENDANCE STATE ──
 *
 * Alloy's layering is already correct here, so this card is thin:
 *
 *   Expected (L3)  schedule_assignments × schedule_patterns → ExpectedAttendanceEntry
 *   Actual   (L4)  child_attendance_events                  (append-only, no updated_*)
 *   Corrections    entry_type + corrects_event_id           → effectiveAttendanceEvents
 *   Derived        buildChildAttendanceReadModel + diffExpectedVsActual
 *
 * ── THE EXPECTED WINDOW IS OPTIONAL AND DEGRADES SILENTLY ──
 *
 * `schedule_patterns.metadata.default_hours` is config and `readPatternDefaultHours` returns null
 * when unset. The card then renders the expected row WITHOUT a window. It must not substitute
 * `childcare_operating_windows` — those are SITE hours, not this child's expectation.
 *
 * ── CORRECTIONS MUST BE VISIBLE ──
 *
 * `child_attendance_events` is append-only precisely so a correction is auditable. A corrected
 * day that renders identically to an uncorrected one throws away the reason the table exists.
 *
 * ── THE STAFF VARIANT IS THE SAME BLUEPRINT ──
 *
 * `staff_presence_events` has the same columns, the same entry_type/corrects_event_id model, and
 * its own fold. This builder takes a fact source; it does not branch on subject type.
 *
 * @see docs/platform/operator/operational-card-system-expansion.md §6
 */

import { type CardLabEvidenceBase, type CardLabHandoff } from "@/lib/cardLab/cardLabTypes";

export type AttendanceDayState =
    | "present"
    | "checked_out"
    | "absent"
    | "not_arrived"
    | "no_record"
    | "closed";

export type AttendanceDayRow = {
    serviceDate: string;
    weekdayLabel: string;
    /** From the L3 expectation projection. */
    expected: boolean;
    /** From `schedule_patterns.metadata.default_hours`. Null when the pattern configures none. */
    expectedWindowLabel: string | null;
    checkInLabel: string | null;
    checkOutLabel: string | null;
    state: AttendanceDayState;
    /** From `ABSENCE_REASONS` — operational classification only, NO billing/subsidy meaning. */
    absenceReasonLabel: string | null;
    absenceExcused: boolean | null;
    /** From the fold: presence recorded with no check_out. */
    missingCheckout: boolean;
    /** True when an effective event on this day is a `correction`. Must be visible. */
    corrected: boolean;
    roomLabel: string | null;
};

/** The canonical action entry points this card places. */
export type AttendanceActionKey =
    | "attendance.check_in"
    | "attendance.check_out"
    | "attendance.mark_absent"
    | "attendance.correct"
    | "attendance.view_history";

export type AttendanceAction = {
    key: AttendanceActionKey;
    label: string;
    /**
     * GAP-2. Only `view_history` is available today. `attendance.record` / `attendance.correct`
     * are NOT registered capabilities for children (staff has `staff_presence.*`), so the card
     * renders these in their real geometry and marks them unavailable rather than calling
     * `POST /api/admin/childcare-attendance` directly — that would be the duplicate mutation
     * path the doctrine forbids.
     */
    available: boolean;
    unavailableReason: string | null;
};

export type AttendanceCardEvidence = CardLabEvidenceBase & {
    today: AttendanceDayRow | null;
    week: AttendanceDayRow[];
    /** From `diffExpectedVsActual`. */
    varianceCount: number;
    correctionCount: number;
    actions: AttendanceAction[];
    historyHandoff: CardLabHandoff;
};

export type AttendanceEvidenceInput = {
    /** `null` = the attendance projection has not answered. NOT "no attendance". */
    days: readonly AttendanceDayRow[] | null;
    todayServiceDate: string | null;
    varianceCount?: number;
    /** Whether child attendance capabilities are registered. False everywhere today (GAP-2). */
    mutationCapabilitiesRegistered?: boolean;
};

const UNAVAILABLE =
    "No registered capability — `attendance.record` / `attendance.correct` are not in the capability registry (GAP-2)";

function buildActions(state: AttendanceDayState | null, registered: boolean): AttendanceAction[] {
    const gate = (key: AttendanceActionKey, label: string): AttendanceAction => ({
        key,
        label,
        available: registered,
        unavailableReason: registered ? null : UNAVAILABLE,
    });
    const actions: AttendanceAction[] = [];
    if (state === "not_arrived" || state === "no_record") actions.push(gate("attendance.check_in", "Check in"));
    if (state === "present") actions.push(gate("attendance.check_out", "Check out"));
    if (state === "not_arrived" || state === "no_record") actions.push(gate("attendance.mark_absent", "Mark absent"));
    actions.push(gate("attendance.correct", "Correct attendance"));
    actions.push({
        key: "attendance.view_history",
        label: "View history",
        available: true,
        unavailableReason: null,
    });
    return actions;
}

function answerForState(row: AttendanceDayRow): { answer: string; support: string | null; chip: string | null; tone: AttendanceCardEvidence["statusTone"] } {
    switch (row.state) {
        case "present":
            return {
                answer: row.missingCheckout ? "Present · checkout missing" : "Present",
                support: row.checkInLabel ? `Checked in ${row.checkInLabel}` : null,
                chip: row.missingCheckout ? "Missing checkout" : "Present",
                tone: row.missingCheckout ? "at-risk" : "ready",
            };
        case "checked_out":
            return {
                answer: "Checked out",
                support:
                    row.checkInLabel && row.checkOutLabel
                        ? `${row.checkInLabel} – ${row.checkOutLabel}`
                        : row.checkOutLabel,
                chip: "Complete",
                tone: "done",
            };
        case "absent":
            return {
                answer: row.absenceReasonLabel ? `Absent — ${row.absenceReasonLabel}` : "Absent",
                support:
                    row.absenceExcused == null ? null : row.absenceExcused ? "Excused" : "Unexcused",
                chip: "Absent",
                tone: "neutral",
            };
        case "not_arrived":
            return {
                answer: "Expected — not arrived",
                support: row.expectedWindowLabel ? `Expected ${row.expectedWindowLabel}` : null,
                chip: "Not arrived",
                tone: "due",
            };
        case "closed":
            return { answer: "Closed day", support: "Site is not open", chip: null, tone: "neutral" };
        case "no_record":
        default:
            return {
                answer: "Not expected today",
                support: null,
                chip: null,
                tone: "neutral",
            };
    }
}

export function buildAttendanceCardEvidence(
    input: AttendanceEvidenceInput,
): AttendanceCardEvidence {
    if (input.days == null) {
        return {
            today: null,
            week: [],
            varianceCount: 0,
            correctionCount: 0,
            actions: [],
            historyHandoff: "attendance_history",
            answerLine: "",
            supportingLine: null,
            statusChip: null,
            statusTone: "neutral",
            resolution: "unresolved",
        };
    }

    const week = [...input.days];
    const today =
        (input.todayServiceDate
            ? week.find((d) => d.serviceDate === input.todayServiceDate)
            : null) ?? null;
    const correctionCount = week.filter((d) => d.corrected).length;
    const registered = Boolean(input.mutationCapabilitiesRegistered);

    if (!today) {
        return {
            today: null,
            week,
            varianceCount: input.varianceCount ?? 0,
            correctionCount,
            actions: buildActions(null, registered),
            historyHandoff: "attendance_history",
            answerLine: week.length > 0 ? "No record today" : "No attendance recorded",
            supportingLine: week.length > 0 ? `${week.length} day${week.length === 1 ? "" : "s"} this week` : null,
            statusChip: null,
            statusTone: "neutral",
            resolution: week.length === 0 ? "empty" : "settled",
        };
    }

    const { answer, support, chip, tone } = answerForState(today);

    return {
        today,
        week,
        varianceCount: input.varianceCount ?? 0,
        correctionCount,
        actions: buildActions(today.state, registered),
        historyHandoff: "attendance_history",
        answerLine: answer,
        supportingLine: support,
        statusChip: chip,
        statusTone: tone,
        resolution: "settled",
    };
}

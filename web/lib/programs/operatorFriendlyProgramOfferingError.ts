/**
 * Operator-facing errors for program offerings / tuition plans.
 * Never surface raw Postgres constraint text.
 */

import { ATTENDANCE_TYPE_LABELS, type AttendanceType } from "@/lib/programs/programOfferings";

export function careFormatLabel(attendanceType: string | null | undefined): string {
    const key = (attendanceType ?? "").trim() as AttendanceType;
    return ATTENDANCE_TYPE_LABELS[key] ?? (attendanceType?.trim() || "this care format");
}

/**
 * Map API / DB failures to calm operator language for tuition plan / offering saves.
 */
export function operatorFriendlyProgramOfferingError(
    raw: string | null | undefined,
    context?: {
        programLabel?: string | null;
        careFormat?: string | null;
        planName?: string | null;
    },
): string {
    const message = (raw ?? "").trim();
    if (!message) return "Could not save this tuition plan. Try again.";

    const care = careFormatLabel(context?.careFormat);
    const program = context?.programLabel?.trim() || "this program";
    const plan = context?.planName?.trim();

    if (
        /program_offerings_unique/i.test(message)
        || (/duplicate key/i.test(message) && /program_offerings/i.test(message))
        || /attendance type already exists/i.test(message)
    ) {
        if (plan) {
            return `A tuition plan named “${plan}” already uses ${care} for ${program}. Choose a different care format or edit the existing plan.`;
        }
        return `A ${care} tuition plan already exists for ${program}. Choose a different care format or open the existing plan.`;
    }

    if (/Cannot change attendance type/i.test(message)) {
        return "Care format can’t change while prices exist on this plan. Create a new plan for the other care format, or clear prices first.";
    }

    if (/duplicate key|unique constraint|23505/i.test(message)) {
        return "A matching tuition plan already exists for this program and care format.";
    }

    // Strip common Postgres wrappers if something slips through.
    if (/violates unique constraint/i.test(message) || /^duplicate key value/i.test(message)) {
        return "A matching tuition plan already exists for this scope.";
    }

    return message;
}

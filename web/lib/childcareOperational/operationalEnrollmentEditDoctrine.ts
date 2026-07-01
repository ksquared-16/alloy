/**
 * Operator edit flows — UX copy and action visibility for Batch 5.
 */

import type { OperationalEnrollmentReadModel } from "@/lib/childcareOperational/operationalEnrollmentReadModel";
import {
    isAgreementNonTerminalStatus,
    isAgreementOperationalStatus,
} from "@/lib/childcareOperational/enrollmentOperationalStatus";

export const OPERATIONAL_EDIT_HISTORY_NOTE =
    "Changes create history. The previous placement or schedule is closed on the day before the new effective date — nothing is overwritten in place.";

export const OPERATIONAL_EDIT_HISTORY_TIMELINE_NOTE =
    "Full placement and schedule history — timeline view coming later. Each change is stored as a new row; use agreement dates and drawer refresh to confirm the latest state.";

export const OPERATIONAL_EDIT_FUTURE_DATED_NOTE =
    "Future-dated changes are allowed. The new row becomes effective on the start date you choose.";

export const OPERATIONAL_EDIT_NO_ACTIVE_PATTERNS_WARNING =
    "No active schedule patterns exist for this site. Add patterns in Settings → Locations before assigning a schedule.";

export type OperationalEnrollmentEditActionKey =
    | "change_placement"
    | "change_schedule"
    | "schedule_withdrawal"
    | "mark_ended"
    | "cancel_agreement";

export const OPERATIONAL_ENROLLMENT_EDIT_ACTION_LABELS: Record<OperationalEnrollmentEditActionKey, string> = {
    change_placement: "Change placement",
    change_schedule: "Change schedule",
    schedule_withdrawal: "Schedule withdrawal",
    mark_ended: "Mark ended",
    cancel_agreement: "Cancel agreement",
};

/** Which edit actions are valid for the current agreement summary. */
export function resolveOperationalEnrollmentEditActions(
    summary: OperationalEnrollmentReadModel | null | undefined
): OperationalEnrollmentEditActionKey[] {
    const agreement = summary?.agreement;
    if (!agreement) return [];

    const status = agreement.status;
    const actions: OperationalEnrollmentEditActionKey[] = [];

    if (isAgreementOperationalStatus(status)) {
        actions.push("change_placement", "change_schedule");
    }

    if (status === "active") {
        actions.push("schedule_withdrawal");
    }

    if (isAgreementNonTerminalStatus(status)) {
        actions.push("mark_ended");
    }

    if (status === "pending_start") {
        actions.push("cancel_agreement");
    }

    return actions;
}

export function canEditOperationalEnrollment(summary: OperationalEnrollmentReadModel | null | undefined): boolean {
    return resolveOperationalEnrollmentEditActions(summary).length > 0;
}

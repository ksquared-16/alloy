/**
 * Enrollment schedule doctrine — family request vs proposed assignment vs committed schedule.
 *
 * - Participation / OCM `schedule_type` (+ draft weekdays) = enrollment schedule **intent**
 *   (family request / early proposal before an operational assignment row exists).
 * - `schedule_assignments.commitment_kind = proposed` = operator **proposed** assignment.
 * - `schedule_assignments.commitment_kind = committed` = operational **committed** schedule.
 *
 * Requested Start lives on participation `start_date`. Operational Start Date resolves from
 * the first committed assignment (`lib/enrollment/effectiveDateAuthority.ts`).
 */

import type { ProofRuntimeRecord } from "@/lib/layout/runtime/proofRecordContext";

function trimOrNull(v: unknown): string | null {
    const s = v != null ? String(v).trim() : "";
    return s || null;
}

function pickDisplay(...values: unknown[]): string | null {
    for (const value of values) {
        const text = trimOrNull(value);
        if (text && text !== "—") return text;
    }
    return null;
}

export const ENROLLMENT_SCHEDULE_INTENT_HEADING = "Enrollment schedule & placement intent";
export const ENROLLMENT_SCHEDULE_INTENT_NOTE =
    "Proposed during enrollment (may be captured before tour). Used for capacity forecasting before approval.";
export const COMMITTED_OPERATIONAL_HEADING = "Committed operational enrollment";
export const COMMITTED_OPERATIONAL_NOTE =
    "Created at approval handoff from the latest valid enrollment proposal.";
export const COMMITTED_SCHEDULE_LABEL = "Committed schedule";
export const PROPOSED_SCHEDULE_LABEL = "Proposed schedule";
export const PROPOSED_PLACEMENT_LABEL = "Proposed placement";

export type EnrollmentPlacementIntent = {
    site: string | null;
    program: string | null;
    room: string | null;
    scheduleProposal: string | null;
    startDate: string | null;
};

export type EnrollmentPlacementIntentRow = {
    id: string;
    display_name?: string | null;
    location_label?: string | null;
    desired_program_label?: string | null;
    program_room_cohort_label?: string | null;
    desired_schedule_label?: string | null;
    schedule_type?: string | null;
    start_date?: string | null;
};

export function buildEnrollmentPlacementIntentFromRow(
    row: EnrollmentPlacementIntentRow
): EnrollmentPlacementIntent {
    return {
        site: pickDisplay(row.location_label),
        program: pickDisplay(row.desired_program_label),
        room: pickDisplay(row.program_room_cohort_label),
        scheduleProposal: pickDisplay(
            row.desired_schedule_label,
            row.schedule_type
        ),
        startDate: pickDisplay(row.start_date),
    };
}

export function resolveEnrollmentPlacementIntentFromRecord(
    record: ProofRuntimeRecord
): EnrollmentPlacementIntent {
    return {
        site: pickDisplay(record["child.location"], record.location_label),
        program: pickDisplay(
            record["child.program"],
            record["inquiry_child.program"],
            record.desired_program_label
        ),
        room: pickDisplay(
            record["child.room"],
            record.program_room_cohort_label,
            record["inquiry_child.program_room_cohort_key"]
        ),
        scheduleProposal: pickDisplay(
            record["child.schedule"],
            record.desired_schedule_label,
            record["inquiry_child.schedule_type"],
            record.schedule_type
        ),
        startDate: pickDisplay(
            record["inquiry_child.start_date"],
            record["child.start_date"],
            record.start_date
        ),
    };
}

export function hasEnrollmentPlacementIntent(intent: EnrollmentPlacementIntent): boolean {
    return Boolean(
        intent.site ||
            intent.program ||
            intent.room ||
            intent.scheduleProposal ||
            intent.startDate
    );
}

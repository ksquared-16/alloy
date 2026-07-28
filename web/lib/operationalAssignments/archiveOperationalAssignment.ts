/**
 * End (archive) an operational assignment without inventing a second ledger.
 * Closes the row with an end date — primary rows must use assignment.set_primary
 * to transfer home, not archive.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

import type { ScheduleAssignmentRow } from "@/lib/childcareOperational/enrollmentOperationalTypes";
import { assertValidIsoDate, compareIsoDates } from "@/lib/childcareOperational/effectiveDating";
import {
    OperationalEnrollmentServiceError,
    trimOrNull,
} from "@/lib/childcareOperational/operationalEnrollmentErrors";

export type ArchiveOperationalAssignmentInput = {
    orgId: string;
    assignmentId: string;
    endDate: string;
    actorUserId?: string | null;
};

export async function archiveOperationalAssignment(
    supabase: SupabaseClient,
    input: ArchiveOperationalAssignmentInput
): Promise<ScheduleAssignmentRow> {
    const assignmentId = trimOrNull(input.assignmentId);
    const endDate = trimOrNull(input.endDate);
    if (!assignmentId || !endDate) {
        throw new OperationalEnrollmentServiceError("invalid_input", "assignmentId and endDate are required");
    }
    assertValidIsoDate(endDate, "endDate");

    const { data, error } = await supabase
        .from("schedule_assignments")
        .select("*")
        .eq("org_id", input.orgId)
        .eq("id", assignmentId)
        .maybeSingle();
    if (error) throw new OperationalEnrollmentServiceError("db_error", error.message);
    const row = data as ScheduleAssignmentRow | null;
    if (!row) throw new OperationalEnrollmentServiceError("not_found", "Assignment not found");
    if (row.is_primary) {
        throw new OperationalEnrollmentServiceError(
            "invalid_state",
            "Cannot archive the primary assignment; set a new primary first"
        );
    }
    if (compareIsoDates(endDate, row.start_date) < 0) {
        throw new OperationalEnrollmentServiceError(
            "validation_failed",
            "endDate must be on or after start_date"
        );
    }

    const { data: updated, error: updateError } = await supabase
        .from("schedule_assignments")
        .update({
            end_date: endDate,
            status: "ended",
            updated_by: trimOrNull(input.actorUserId),
        })
        .eq("org_id", input.orgId)
        .eq("id", assignmentId)
        .select("*")
        .single();
    if (updateError || !updated) {
        throw new OperationalEnrollmentServiceError(
            "db_error",
            updateError?.message ?? "Could not archive assignment"
        );
    }
    return updated as ScheduleAssignmentRow;
}

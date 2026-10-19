/**
 * A PROCESSING CASE WHOSE FAMILY OR CHILD NO LONGER EXISTS IS EVIDENCE, NOT WORK.
 *
 * `processing_case_subject_removed` (migration 20261129090000) is a computed field on processing_cases:
 * true when the case's primary packet-session source names a household or child that is gone. The read
 * model keeps such cases out of active queues and counts; the mutation routes refuse them here:
 *   - approve would otherwise mark the case "completed" with nothing to hand off — a fabricated outcome;
 *   - a proposal commit (or its preview) would write records for a family that does not exist, or
 *     resolve against whatever the deleted ids now fail to find.
 * Archive stays allowed: it is how an operator closes one. Nothing about the case or its evidence changes.
 */
import { jsonError } from "@/lib/admin/forms/formsAdminResponses";

export const PROCESSING_SUBJECT_REMOVED_FIELD = "processing_case_subject_removed";
export const PROCESSING_SUBJECT_REMOVED_CODE = "processing_subject_removed";
export const PROCESSING_SUBJECT_REMOVED_DETAIL =
    "The family or child this paperwork was for no longer exists. The case is kept as evidence and cannot be approved or committed.";

export function isProcessingCaseSubjectRemoved(row: unknown): boolean {
    return (row as Record<string, unknown> | null)?.[PROCESSING_SUBJECT_REMOVED_FIELD] === true;
}

export function processingSubjectRemovedResponse() {
    return jsonError(PROCESSING_SUBJECT_REMOVED_DETAIL, 409, { code: PROCESSING_SUBJECT_REMOVED_CODE });
}

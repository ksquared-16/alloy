/**
 * Enrollment lead intake classification — clean auto-created lead vs operator attention.
 * Used by inbox lanes, intake cases, quick review, and intake review surfaces.
 */

import type { SubmissionAttachRow } from "@/lib/forms/submissionOutcomeSummary";

function metaRecord(payloadMeta: unknown): Record<string, unknown> {
    if (!payloadMeta || typeof payloadMeta !== "object" || Array.isArray(payloadMeta)) return {};
    return payloadMeta as Record<string, unknown>;
}

export function intakeResolutionPath(payloadMeta: unknown): string {
    const m = metaRecord(payloadMeta);
    return typeof m.intake_resolution_path === "string" ? m.intake_resolution_path.trim() : "";
}

export function intakeOpportunityMatch(payloadMeta: unknown): string {
    const m = metaRecord(payloadMeta);
    return typeof m.intake_opportunity_match === "string" ? m.intake_opportunity_match.trim() : "";
}

/** Person + customer + opportunity linked on the submission row. */
export function hasEnrollmentLeadCrmLinks(attachRow: SubmissionAttachRow): boolean {
    return !!(
        attachRow.opportunity_id &&
        (attachRow.person_id || attachRow.customer_id)
    );
}

/**
 * Intake still needs operator review, linkage, or error correction
 * (duplicate ambiguity, explicit review, intake failure, missing routing).
 */
export function enrollmentIntakeRequiresOperatorAttention(params: {
    payloadMeta: unknown;
    attachRow?: SubmissionAttachRow;
}): boolean {
    const m = metaRecord(params.payloadMeta);
    const path = intakeResolutionPath(m);
    const match = intakeOpportunityMatch(m);

    if (m.intake_identity_name_mismatch === true) return true;
    if (m.intake_needs_review === true) return true;
    if (path === "ambiguous_contact" || path === "needs_human_review" || path === "ambiguous_opportunity") {
        return true;
    }
    if (match === "ambiguous") return true;
    if (path === "skipped_error") return true;
    if (m.intake_work_unit_department_mismatch === true) return true;

    const attach = params.attachRow;
    if (path === "skipped_intake_disabled" || path === "skipped_missing_config") {
        if (
            attach &&
            !attach.person_id &&
            !attach.customer_id &&
            !attach.customer_member_id &&
            !attach.opportunity_id
        ) {
            return true;
        }
    }

    return false;
}

/**
 * Successful website inquiry / enrollment lead intake — records created, routed, no conflict.
 * Operator continues in the opportunity queue; intake action inbox should not treat as a problem.
 */
export function isCleanOperationalizedEnrollmentLead(params: {
    status: string;
    payloadMeta: unknown;
    attachRow: SubmissionAttachRow;
}): boolean {
    if (params.status.toLowerCase() !== "submitted") return false;
    if (enrollmentIntakeRequiresOperatorAttention(params)) return false;

    const m = metaRecord(params.payloadMeta);
    const path = intakeResolutionPath(m);
    const match = intakeOpportunityMatch(m);

    const linked = hasEnrollmentLeadCrmLinks(params.attachRow);
    const createdPath = path === "created_records" || match === "created";
    const autoOp = m.intake_auto_operationalized === true;

    if (linked && (autoOp || createdPath)) return true;

    // Trust submit-time auto-op outcome when row FK columns are missing from list payloads.
    if (autoOp && createdPath) return true;

    return false;
}

/** New lead created (not an existing-family attach/update). */
export function isCleanCreatedEnrollmentLead(params: {
    status: string;
    payloadMeta: unknown;
    attachRow: SubmissionAttachRow;
}): boolean {
    if (!isCleanOperationalizedEnrollmentLead(params)) return false;
    const path = intakeResolutionPath(params.payloadMeta);
    const match = intakeOpportunityMatch(params.payloadMeta);
    if (match === "attached_existing") return false;
    if (path === "matched_email" || path === "matched_phone") return false;
    return path === "created_records" || match === "created" || path === "created_person";
}

/**
 * Quick Review modal presentation (IC-6).
 * Operator-first intake case summary — no raw meta keys in primary copy.
 */

import {
    buildIntakeCasePresentationRows,
    resolveSubmissionPacketSessionId,
    type IntakeCaseSubmissionInput,
} from "@/lib/forms/intakeCasePresentation";
import {
    deriveSubmissionOperationalNarrative,
    submissionFamilyLabel,
} from "@/lib/forms/submissionOperationalNarrative";
import {
    resolveSubmissionInboxLane,
    type SubmissionInboxRow,
} from "@/lib/forms/submissionInboxPresentation";

export type IntakeQuickReviewSummaryTone = "success" | "warning" | "neutral";

export type IntakeQuickReviewViewModel = {
    headerTitle: string | null;
    intakeSummary: {
        capturedLine: string;
        operationalLine: string | null;
        routingLine: string | null;
        statusLine: string;
        statusTone: IntakeQuickReviewSummaryTone;
    };
    needsAction: {
        items: string[];
        clearMessage: string | null;
    };
    recommendedNextStep: string;
    evidence: {
        formName: string;
        submittedAtLabel: string;
        hasSignature: boolean;
        hasGeneratedDocument: boolean;
        submissionCount: number;
    };
    showConfirmLinkage: boolean;
};

function metaRecord(payloadMeta: unknown): Record<string, unknown> {
    if (!payloadMeta || typeof payloadMeta !== "object" || Array.isArray(payloadMeta)) return {};
    return payloadMeta as Record<string, unknown>;
}

function payloadRecord(row: SubmissionInboxRow): Record<string, unknown> {
    const payload = row.payload;
    if (!payload || typeof payload !== "object" || Array.isArray(payload)) return {};
    return payload as Record<string, unknown>;
}

function submissionHasSignature(row: SubmissionInboxRow): boolean {
    const sigs = payloadRecord(row).signatures;
    if (!sigs || typeof sigs !== "object" || Array.isArray(sigs)) return false;
    return Object.keys(sigs as Record<string, unknown>).length > 0;
}

function submissionHasDocument(row: SubmissionInboxRow): boolean {
    const meta = metaRecord(row.payload?.meta);
    return typeof meta.document_id === "string" && meta.document_id.trim().length > 0;
}

function operationalRecordLine(row: SubmissionInboxRow, meta: Record<string, unknown>): string | null {
    if (row.status === "draft") return "Not submitted yet";

    const path = typeof meta.intake_resolution_path === "string" ? meta.intake_resolution_path.trim() : "";
    const match = typeof meta.intake_opportunity_match === "string" ? meta.intake_opportunity_match.trim() : "";
    const autoOp = meta.intake_auto_operationalized === true;

    if (path === "skipped_intake_disabled" || path === "skipped_missing_config") {
        return "Submission saved — intake not configured on this link";
    }
    if (path === "ambiguous_contact" || path === "ambiguous_opportunity" || match === "ambiguous") {
        return "Potential duplicate — pick the correct family";
    }
    if (match === "attached_existing" || (path === "matched_email" && match !== "created")) {
        return autoOp ? "Attached to existing family · Auto-operationalized" : "Attached to existing family";
    }
    if (path === "created_records" || match === "created" || row.opportunity_id) {
        if (autoOp) return "New lead created · Auto-operationalized";
        if (row.opportunity_id) return "New lead created";
    }
    if (!row.opportunity_id && !row.person_id && !row.customer_id) {
        return "No enrollment lead or family profile linked yet";
    }

    const parts: string[] = [];
    if (row.opportunity_id) parts.push("Enrollment lead updated");
    else if (row.person_id || row.customer_id) parts.push("Family profile linked");
    return parts.length > 0 ? parts.join(" · ") : null;
}

function routingLine(row: SubmissionInboxRow, meta: Record<string, unknown>): string | null {
    if (meta.intake_work_unit_department_mismatch === true) {
        return "Routing incomplete — verify work unit and department on the intake file";
    }
    if (row.opportunity_id) return "Routed to enrollment pipeline";
    if (row.status === "draft") return null;
    const path = typeof meta.intake_resolution_path === "string" ? meta.intake_resolution_path.trim() : "";
    if (path === "skipped_intake_disabled" || path === "skipped_missing_config") return null;
    if (!row.opportunity_id && !row.person_id) return "Routing pending family match";
    return null;
}

function caseStatusLine(
    row: SubmissionInboxRow,
    meta: Record<string, unknown>,
    lane: ReturnType<typeof resolveSubmissionInboxLane>
): { line: string; tone: IntakeQuickReviewSummaryTone } {
    if (row.status === "draft") {
        return { line: "Waiting for family to submit", tone: "neutral" };
    }

    const packetSessionId = resolveSubmissionPacketSessionId(row as IntakeCaseSubmissionInput);
    if (packetSessionId && row.status === "draft") {
        return { line: "Waiting for packet completion", tone: "neutral" };
    }

    if (meta.intake_auto_operationalized === true && meta.intake_needs_review !== true) {
        return { line: "Auto-operationalized", tone: "success" };
    }

    if (lane === "needsLinking") {
        return { line: "Needs family match", tone: "warning" };
    }

    if (lane === "needsReview" || meta.intake_needs_review === true) {
        return { line: "Review required before enrollment continues", tone: "warning" };
    }

    const path = typeof meta.intake_resolution_path === "string" ? meta.intake_resolution_path.trim() : "";
    if (path === "ambiguous_contact" || path === "ambiguous_opportunity") {
        return { line: "Duplicate ambiguity — operator decision needed", tone: "warning" };
    }

    if (lane === "recentlySubmitted") {
        return { line: "Ready to continue enrollment", tone: "success" };
    }

    return { line: "Intake captured", tone: "neutral" };
}

function buildNeedsActionItems(
    row: SubmissionInboxRow,
    meta: Record<string, unknown>,
    lane: ReturnType<typeof resolveSubmissionInboxLane>
): string[] {
    const items: string[] = [];
    const path = typeof meta.intake_resolution_path === "string" ? meta.intake_resolution_path.trim() : "";

    if (lane === "needsLinking") {
        items.push("Needs family match");
    } else if (
        !row.opportunity_id &&
        row.status === "submitted" &&
        path !== "skipped_intake_disabled" &&
        !row.person_id &&
        !row.customer_id
    ) {
        items.push("Needs family match");
    }

    if (meta.intake_needs_review === true || lane === "needsReview") {
        items.push("Review required before enrollment continues");
    }

    if (meta.intake_work_unit_department_mismatch === true) {
        items.push("Missing routing — verify work unit assignment");
    }

    if (path === "ambiguous_contact" || path === "ambiguous_opportunity") {
        items.push("Duplicate ambiguity — resolve the correct family");
    }

    if (row.status === "draft") {
        items.push("Waiting for family to submit");
    }

    const packetSessionId = resolveSubmissionPacketSessionId(row as IntakeCaseSubmissionInput);
    if (packetSessionId && row.status === "draft") {
        items.push("Waiting for packet completion");
    }

    return [...new Set(items)];
}

function shouldShowConfirmLinkage(row: SubmissionInboxRow, meta: Record<string, unknown>): boolean {
    if (row.status !== "submitted") return false;
    const hasLinks = !!(row.person_id || row.customer_id || row.customer_member_id || row.opportunity_id);
    return hasLinks && meta.intake_needs_review === true;
}

/** Build operator-first quick review view model from a primary submission row. */
export function buildIntakeQuickReviewViewModel(params: {
    row: SubmissionInboxRow;
    formName: string;
    submittedAtLabel: string;
    submissionCount?: number;
}): IntakeQuickReviewViewModel {
    const { row, formName, submittedAtLabel } = params;
    const meta = metaRecord(row.payload?.meta);
    const lane = resolveSubmissionInboxLane(row);
    const narrative = deriveSubmissionOperationalNarrative(row);
    const status = caseStatusLine(row, meta, lane);

    const intakeCase = buildIntakeCasePresentationRows({
        submissions: [row as IntakeCaseSubmissionInput],
        formsById: { [row.form_definition_id]: formName },
    })[0];

    const submissionCount = params.submissionCount ?? intakeCase?.submission_count ?? 1;
    const needsActionItems = buildNeedsActionItems(row, meta, lane);

    const autoClear =
        meta.intake_auto_operationalized === true &&
        meta.intake_needs_review !== true &&
        needsActionItems.length === 0;

    const manualClear =
        needsActionItems.length === 0 &&
        lane === "recentlySubmitted" &&
        meta.intake_needs_review !== true;

    const clearMessage =
        autoClear || manualClear ? "No manual review required." : null;

    return {
        headerTitle: submissionFamilyLabel(row),
        intakeSummary: {
            capturedLine: `${formName} form received`,
            operationalLine: operationalRecordLine(row, meta),
            routingLine: routingLine(row, meta),
            statusLine: status.line,
            statusTone: status.tone,
        },
        needsAction: {
            items: clearMessage ? [] : needsActionItems,
            clearMessage,
        },
        recommendedNextStep: intakeCase?.recommended_next_action ?? narrative.operatorAction,
        evidence: {
            formName,
            submittedAtLabel,
            hasSignature: submissionHasSignature(row),
            hasGeneratedDocument: submissionHasDocument(row),
            submissionCount,
        },
        showConfirmLinkage: shouldShowConfirmLinkage(row, meta),
    };
}

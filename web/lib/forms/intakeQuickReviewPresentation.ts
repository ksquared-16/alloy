/**
 * Quick Review modal presentation (IC-6 / IC-5.6).
 * Operator-first intake case summary — no raw meta keys in primary copy.
 */

import type {
    IntakeCaseOperationalizedState,
    IntakeCaseStatusBucket,
} from "@/lib/forms/intakeCasePresentation";
import {
    buildIntakeCasePresentationRows,
    resolveSubmissionPacketSessionId,
    type IntakeCaseSubmissionInput,
} from "@/lib/forms/intakeCasePresentation";
import { ADMIN_FORMS_UI_BASE } from "@/lib/forms/adminFormsUiBase";
import {
    deriveSubmissionOperationalNarrative,
    submissionFamilyLabel,
} from "@/lib/forms/submissionOperationalNarrative";
import {
    isCleanCreatedEnrollmentLead,
    isCleanOperationalizedEnrollmentLead,
} from "@/lib/forms/intakeEnrollmentLeadClassification";
import {
    resolveSubmissionInboxLane,
    submissionInboxAttachRow,
    type SubmissionInboxRow,
} from "@/lib/forms/submissionInboxPresentation";

export type IntakeQuickReviewSummaryTone = "success" | "warning" | "neutral";

/** Derived intake case context when opening quick review from a case row (IC-5.6). */
export type IntakeQuickReviewCaseContext = {
    opportunityId?: string | null;
    statusBucket?: IntakeCaseStatusBucket;
    operationalizedState?: IntakeCaseOperationalizedState;
    recommendedNextAction?: string;
    intakeFileHref?: string;
};

export type IntakeQuickReviewLeadCreatedFields = {
    contactName: string | null;
    email: string | null;
    phone: string | null;
    school: string | null;
    status: string;
};

export type IntakeQuickReviewViewModel = {
    modalTitle: string;
    headerTitle: string | null;
    leadCreatedMode: boolean;
    leadCreatedSummary: string | null;
    leadCreatedFields: IntakeQuickReviewLeadCreatedFields | null;
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
    opportunityId: string | null;
    intakeFileHref: string;
    primaryOpenLabel: string;
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

function resolveOpportunityId(row: SubmissionInboxRow, caseContext?: IntakeQuickReviewCaseContext): string | null {
    const fromRow = typeof row.opportunity_id === "string" ? row.opportunity_id.trim() : "";
    if (fromRow) return fromRow;
    const fromCase = typeof caseContext?.opportunityId === "string" ? caseContext.opportunityId.trim() : "";
    return fromCase || null;
}

function payloadValues(row: SubmissionInboxRow): Record<string, unknown> {
    const values = payloadRecord(row).values;
    if (!values || typeof values !== "object" || Array.isArray(values)) return {};
    return values as Record<string, unknown>;
}

function readStringValue(values: Record<string, unknown>, key: string): string | null {
    const raw = values[key];
    return typeof raw === "string" && raw.trim() ? raw.trim() : null;
}

function schoolLabelFromSubmission(row: SubmissionInboxRow, meta: Record<string, unknown>): string | null {
    const values = payloadValues(row);
    for (const key of ["school", "campus", "location", "preferred_location", "preferred_campus"]) {
        const label = readStringValue(values, key);
        if (label) return label;
    }
    if (row.opportunity_id || meta.intake_routing_work_unit_id) return "Routed to enrollment pipeline";
    return null;
}

function buildLeadCreatedFields(
    row: SubmissionInboxRow,
    meta: Record<string, unknown>
): IntakeQuickReviewLeadCreatedFields {
    const values = payloadValues(row);
    const joinedGuardian = [readStringValue(values, "guardian_first_name"), readStringValue(values, "guardian_last_name")]
        .filter(Boolean)
        .join(" ")
        .trim();
    const guardian =
        readStringValue(values, "guardian_full_name") ??
        (joinedGuardian || null) ??
        submissionFamilyLabel(row);
    return {
        contactName: guardian,
        email: readStringValue(values, "guardian_email"),
        phone: readStringValue(values, "guardian_phone"),
        school: schoolLabelFromSubmission(row, meta),
        status: "New Lead",
    };
}

function isAutoOperationalizedLead(
    row: SubmissionInboxRow,
    meta: Record<string, unknown>,
    caseContext?: IntakeQuickReviewCaseContext
): boolean {
    const attachRow = submissionInboxAttachRow(row);
    if (
        isCleanOperationalizedEnrollmentLead({
            status: row.status,
            payloadMeta: meta,
            attachRow,
        })
    ) {
        return true;
    }
    if (meta.intake_auto_operationalized === true && meta.intake_needs_review !== true) return true;
    if (caseContext?.operationalizedState === "auto_operationalized") return true;
    if (
        caseContext?.statusBucket === "auto_operationalized" &&
        resolveOpportunityId(row, caseContext) &&
        meta.intake_needs_review !== true
    ) {
        return true;
    }
    return false;
}

function operationalRecordLine(
    row: SubmissionInboxRow,
    meta: Record<string, unknown>,
    caseContext?: IntakeQuickReviewCaseContext
): string | null {
    if (row.status === "draft") return "Not submitted yet";

    const opportunityId = resolveOpportunityId(row, caseContext);
    const path = typeof meta.intake_resolution_path === "string" ? meta.intake_resolution_path.trim() : "";
    const match = typeof meta.intake_opportunity_match === "string" ? meta.intake_opportunity_match.trim() : "";
    const autoOp = isAutoOperationalizedLead(row, meta, caseContext);

    if (opportunityId && autoOp) return "New lead created · Auto-operationalized";
    if (opportunityId && meta.intake_needs_review !== true) return "New lead created";

    if (path === "skipped_intake_disabled" || path === "skipped_missing_config") {
        if (!opportunityId && !row.person_id && !row.customer_id) {
            return "Submission saved — intake not configured on this link";
        }
    }
    if (path === "ambiguous_contact" || path === "ambiguous_opportunity" || match === "ambiguous") {
        return "Potential duplicate — pick the correct family";
    }
    if (match === "attached_existing" || path === "existing_record_launch" || (path === "matched_email" && match !== "created")) {
        return autoOp ? "Existing family update received · Auto-operationalized" : "Existing family update received";
    }
    if (path === "created_records" || match === "created") {
        if (autoOp) return "New lead created · Auto-operationalized";
        if (opportunityId) return "New lead created";
    }
    if (!opportunityId && !row.person_id && !row.customer_id) {
        return "No enrollment lead or family profile linked yet";
    }

    const parts: string[] = [];
    if (opportunityId) parts.push("Enrollment lead updated");
    else if (row.person_id || row.customer_id) parts.push("Family profile linked");
    return parts.length > 0 ? parts.join(" · ") : null;
}

function routingLine(
    row: SubmissionInboxRow,
    meta: Record<string, unknown>,
    caseContext?: IntakeQuickReviewCaseContext
): string | null {
    if (meta.intake_work_unit_department_mismatch === true) {
        return "Routing incomplete — verify work unit and department on the intake file";
    }
    const opportunityId = resolveOpportunityId(row, caseContext);
    if (opportunityId) return "Routed to enrollment pipeline";
    if (row.status === "draft") return null;
    const path = typeof meta.intake_resolution_path === "string" ? meta.intake_resolution_path.trim() : "";
    if (path === "skipped_intake_disabled" || path === "skipped_missing_config") return null;
    if (!opportunityId && !row.person_id) return "Routing pending family match";
    return null;
}

function caseStatusLine(
    row: SubmissionInboxRow,
    meta: Record<string, unknown>,
    lane: ReturnType<typeof resolveSubmissionInboxLane>,
    caseContext?: IntakeQuickReviewCaseContext
): { line: string; tone: IntakeQuickReviewSummaryTone } {
    if (row.status === "draft") {
        return { line: "Waiting for family to submit", tone: "neutral" };
    }

    const attachRow = submissionInboxAttachRow(row);
    const cleanCreated = isCleanCreatedEnrollmentLead({
        status: row.status,
        payloadMeta: meta,
        attachRow,
    });
    if (cleanCreated) {
        return { line: "New Lead", tone: "success" };
    }

    const packetSessionId = resolveSubmissionPacketSessionId(row as IntakeCaseSubmissionInput);
    if (packetSessionId && row.status === "draft") {
        return { line: "Waiting for packet completion", tone: "neutral" };
    }

    if (isAutoOperationalizedLead(row, meta, caseContext)) {
        return { line: "Auto-operationalized", tone: "success" };
    }

    if (lane === "needsLinking") {
        return { line: "Needs family match", tone: "warning" };
    }

    if (meta.intake_needs_review === true || lane === "needsReview") {
        return { line: "Review required before enrollment continues", tone: "warning" };
    }

    const path = typeof meta.intake_resolution_path === "string" ? meta.intake_resolution_path.trim() : "";
    if (path === "ambiguous_contact" || path === "ambiguous_opportunity") {
        return { line: "Duplicate ambiguity — operator decision needed", tone: "warning" };
    }

    if (lane === "recentlySubmitted" || caseContext?.statusBucket === "recent" || caseContext?.statusBucket === "auto_operationalized") {
        return { line: "Ready to continue enrollment", tone: "success" };
    }

    return { line: "Intake captured", tone: "neutral" };
}

function buildNeedsActionItems(
    row: SubmissionInboxRow,
    meta: Record<string, unknown>,
    lane: ReturnType<typeof resolveSubmissionInboxLane>,
    caseContext?: IntakeQuickReviewCaseContext
): string[] {
    if (isAutoOperationalizedLead(row, meta, caseContext)) return [];

    const items: string[] = [];
    const path = typeof meta.intake_resolution_path === "string" ? meta.intake_resolution_path.trim() : "";
    const opportunityId = resolveOpportunityId(row, caseContext);

    if (meta.intake_identity_name_mismatch === true) {
        items.push("Possible existing family match");
    }

    if (lane === "needsLinking") {
        items.push("Needs family match");
    } else if (
        !opportunityId &&
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

function resolveIntakeFileHref(row: SubmissionInboxRow, caseContext?: IntakeQuickReviewCaseContext): string {
    if (caseContext?.intakeFileHref) return caseContext.intakeFileHref;
    return `${ADMIN_FORMS_UI_BASE}/${encodeURIComponent(row.form_definition_id)}/submissions/${encodeURIComponent(row.id)}`;
}

function resolveRecommendedNextStep(
    row: SubmissionInboxRow,
    meta: Record<string, unknown>,
    caseContext: IntakeQuickReviewCaseContext | undefined,
    intakeCaseRecommended: string | undefined,
    narrativeAction: string
): string {
    if (caseContext?.recommendedNextAction?.trim()) return caseContext.recommendedNextAction.trim();
    if (intakeCaseRecommended?.trim()) return intakeCaseRecommended.trim();
    const opportunityId = resolveOpportunityId(row, caseContext);
    if (isAutoOperationalizedLead(row, meta, caseContext) && opportunityId) {
        const cleanCreated = isCleanCreatedEnrollmentLead({
            status: row.status,
            payloadMeta: meta,
            attachRow: submissionInboxAttachRow(row),
        });
        return cleanCreated ?
                "Open the enrollment lead to continue in the opportunity queue."
            :   "Continue enrollment";
    }
    return narrativeAction;
}

function resolvePrimaryOpenLabel(opportunityId: string | null, autoOp: boolean, cleanCreated: boolean): string {
    if (opportunityId && cleanCreated) return "Open Lead";
    if (opportunityId && autoOp) return "Open Lead";
    if (opportunityId) return "Open lead";
    return "Open intake file";
}

/** Build operator-first quick review view model from a primary submission row. */
export function buildIntakeQuickReviewViewModel(params: {
    row: SubmissionInboxRow;
    formName: string;
    submittedAtLabel: string;
    submissionCount?: number;
    caseContext?: IntakeQuickReviewCaseContext;
}): IntakeQuickReviewViewModel {
    const { row, formName, submittedAtLabel, caseContext } = params;
    const meta = metaRecord(row.payload?.meta);
    const lane = resolveSubmissionInboxLane(row);
    const narrative = deriveSubmissionOperationalNarrative(row);
    const status = caseStatusLine(row, meta, lane, caseContext);
    const opportunityId = resolveOpportunityId(row, caseContext);
    const autoOp = isAutoOperationalizedLead(row, meta, caseContext);
    const attachRow = submissionInboxAttachRow(row);
    const leadCreatedMode = isCleanCreatedEnrollmentLead({
        status: row.status,
        payloadMeta: meta,
        attachRow,
    });
    const familyLabel = submissionFamilyLabel(row);

    const intakeCase = buildIntakeCasePresentationRows({
        submissions: [row as IntakeCaseSubmissionInput],
        formsById: { [row.form_definition_id]: formName },
    })[0];

    const submissionCount = params.submissionCount ?? intakeCase?.submission_count ?? 1;
    const needsActionItems = buildNeedsActionItems(row, meta, lane, caseContext);

    const autoClear = autoOp && needsActionItems.length === 0;
    const manualClear =
        needsActionItems.length === 0 &&
        (lane === "recentlySubmitted" || caseContext?.statusBucket === "recent" || caseContext?.statusBucket === "auto_operationalized") &&
        meta.intake_needs_review !== true;

    const clearMessage =
        autoClear || manualClear ? "No manual review required." : null;

    return {
        modalTitle: leadCreatedMode ? "Lead created" : familyLabel ?? "Intake case review",
        headerTitle: leadCreatedMode ? "Lead created" : familyLabel,
        leadCreatedMode,
        leadCreatedSummary:
            leadCreatedMode ? "A new enrollment lead was created from this submission." : null,
        leadCreatedFields: leadCreatedMode ? buildLeadCreatedFields(row, meta) : null,
        intakeSummary: {
            capturedLine:
                leadCreatedMode ?
                    "A new enrollment lead was created from this submission."
                :   `${formName} form received`,
            operationalLine: leadCreatedMode ? null : operationalRecordLine(row, meta, caseContext),
            routingLine: leadCreatedMode ? null : routingLine(row, meta, caseContext),
            statusLine: status.line,
            statusTone: status.tone,
        },
        needsAction: {
            items: clearMessage ? [] : needsActionItems,
            clearMessage,
        },
        recommendedNextStep:
            leadCreatedMode && opportunityId ?
                "Open the enrollment lead to continue in the opportunity queue."
            :   resolveRecommendedNextStep(
                    row,
                    meta,
                    caseContext,
                    intakeCase?.recommended_next_action,
                    narrative.operatorAction
                ),
        evidence: {
            formName,
            submittedAtLabel,
            hasSignature: submissionHasSignature(row),
            hasGeneratedDocument: submissionHasDocument(row),
            submissionCount,
        },
        showConfirmLinkage: shouldShowConfirmLinkage(row, meta),
        opportunityId,
        intakeFileHref: resolveIntakeFileHref(row, caseContext),
        primaryOpenLabel: resolvePrimaryOpenLabel(opportunityId, autoOp, leadCreatedMode),
    };
}

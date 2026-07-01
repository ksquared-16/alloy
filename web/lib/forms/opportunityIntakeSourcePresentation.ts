/**
 * Opportunity drawer — intake source presentation (lifecycle coherence sprint).
 * Surfaces form provenance without new schema.
 */

import { ADMIN_FORMS_UI_BASE } from "@/lib/forms/adminFormsUiBase";
import { submissionFamilyLabel } from "@/lib/forms/submissionOperationalNarrative";
import type { SubmissionInboxRow } from "@/lib/forms/submissionInboxPresentation";

export type OpportunityIntakeSourceRow = {
    submission_id: string;
    form_definition_id: string;
    form_name: string;
    submitted_at: string | null;
    status: string;
    payload: SubmissionInboxRow["payload"];
};

export type OpportunityIntakeSourceViewModel = {
    headline: string;
    sourceLine: string;
    submittedLine: string | null;
    outcomeLine: string | null;
    nextStepLine: string;
    intakeFileHref: string;
    formName: string;
    familyLabel: string | null;
    autoOperationalized: boolean;
    reviewRequired: boolean;
};

function metaRecord(payload: unknown): Record<string, unknown> {
    if (!payload || typeof payload !== "object" || Array.isArray(payload)) return {};
    const root = payload as Record<string, unknown>;
    const meta = root.meta;
    if (!meta || typeof meta !== "object" || Array.isArray(meta)) return {};
    return meta as Record<string, unknown>;
}

export function buildOpportunityIntakeSourceViewModel(
    row: OpportunityIntakeSourceRow | null | undefined
): OpportunityIntakeSourceViewModel | null {
    if (!row?.submission_id || !row.form_definition_id) return null;

    const inboxRow: SubmissionInboxRow = {
        id: row.submission_id,
        status: row.status,
        created_at: row.submitted_at ?? new Date().toISOString(),
        submitted_at: row.submitted_at,
        form_definition_id: row.form_definition_id,
        person_id: null,
        customer_id: null,
        customer_member_id: null,
        opportunity_id: null,
        payload: row.payload,
    };

    const meta = metaRecord(row.payload);
    const familyLabel = submissionFamilyLabel(inboxRow);
    const autoOp = meta.intake_auto_operationalized === true && meta.intake_needs_review !== true;
    const reviewRequired = meta.intake_needs_review === true;

    let outcomeLine: string | null = null;
    if (autoOp) outcomeLine = "New lead created · Ready in enrollment pipeline";
    else if (reviewRequired) {
        const reason =
            typeof meta.intake_review_reason === "string" ? meta.intake_review_reason.trim() : "";
        outcomeLine =
            reason ?
                `Review required — ${reason}`
            :   "Review required before enrollment continues";
    } else if (meta.intake_opportunity_match === "attached_existing") {
        outcomeLine = "Attached to this family — no duplicate lead";
    }

    const nextStepLine =
        reviewRequired ? "Review intake submission, then continue enrollment"
        : autoOp ? "Continue enrollment — contact family or schedule next step"
        : "Open intake file for details";

    return {
        headline: "Intake source",
        sourceLine: `${row.form_name} · Public form submission`,
        submittedLine: row.submitted_at ? `Submitted ${row.submitted_at}` : null,
        outcomeLine,
        nextStepLine,
        intakeFileHref: `${ADMIN_FORMS_UI_BASE}/${encodeURIComponent(row.form_definition_id)}/submissions/${encodeURIComponent(row.submission_id)}`,
        formName: row.form_name,
        familyLabel,
        autoOperationalized: autoOp,
        reviewRequired,
    };
}

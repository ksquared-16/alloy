/**
 * Forms/Documents operational presentation — labels, tone rules, section ids.
 *
 * | Domain key | Operator label | Badge tone |
 * |------------|----------------|------------|
 * | operator_review null | Needs review | warning |
 * | needs_review | Needs review | warning |
 * | needs_correction | Needs correction | warning |
 * | approved | Approved | success |
 * | rejected | Rejected | error |
 * | packet in_progress | In progress | info |
 * | packet completed | Completed | neutral |
 * | packet cancelled | Cancelled | neutral |
 * | submission draft | Draft | neutral |
 * | submission submitted | Submitted | success |
 * | artifact generated_pdf | Generated PDF | success |
 * | artifact submitted_record | Submitted form record | info |
 */

import type { DocumentProvenanceV1 } from "@/lib/forms/packets/packetReviewRollupTypes";
import {
    artifactKindDisplayLabel,
    formatPacketDocumentProvenanceLine,
    generationLabelDisplay,
} from "@/lib/forms/packets/documentProvenanceDisplay";

export type FormsReviewBadgeTone = "neutral" | "info" | "success" | "warning" | "error" | "attention";

export type OperatorReviewStatusKey =
    | "needs_review"
    | "approved"
    | "rejected"
    | "needs_correction"
    | null;

export type PacketSessionStatusKey = "in_progress" | "completed" | "cancelled" | string;

export type PacketArtifactKindKey = "generated_pdf" | "submitted_record" | string;

/** Stable section ids for case-file layout (UX-D). */
export const FORMS_CASE_FILE_SECTION = {
    header: "case-header",
    intakeContext: "intake-context",
    bosSummary: "bos-review-summary",
    whatChanged: "what-changed",
    needsAttention: "needs-attention",
    submittedForms: "submitted-forms",
    documents: "documents-records",
    reviewActions: "review-actions",
    technical: "technical-details",
} as const;

export function operatorReviewStatusLabel(status: string | null): string {
    if (status == null) return "Needs review";
    switch (status) {
        case "needs_review":
            return "Needs review";
        case "needs_correction":
            return "Needs correction";
        case "approved":
            return "Approved";
        case "rejected":
            return "Rejected";
        default: {
            const s = status.replace(/_/g, " ");
            return s.charAt(0).toUpperCase() + s.slice(1);
        }
    }
}

export function operatorReviewStatusTone(status: string | null): FormsReviewBadgeTone {
    if (status == null || status === "needs_review" || status === "needs_correction") return "warning";
    if (status === "approved") return "success";
    if (status === "rejected") return "error";
    return "neutral";
}

export function packetSessionStatusLabel(status: string): string {
    switch (status) {
        case "in_progress":
            return "In progress";
        case "completed":
            return "Completed";
        case "cancelled":
            return "Cancelled";
        default: {
            const s = status.replace(/_/g, " ");
            return s.charAt(0).toUpperCase() + s.slice(1);
        }
    }
}

export function packetSessionStatusTone(status: string): FormsReviewBadgeTone {
    switch (status) {
        case "in_progress":
            return "info";
        case "completed":
            return "neutral";
        case "cancelled":
            return "neutral";
        default:
            return "neutral";
    }
}

export function submissionStatusLabel(status: string): string {
    if (status === "submitted") return "Submitted";
    if (status === "draft") return "Draft";
    const s = status.replace(/_/g, " ");
    return s.charAt(0).toUpperCase() + s.slice(1);
}

export function submissionStatusTone(status: string): FormsReviewBadgeTone {
    if (status === "submitted") return "success";
    if (status === "draft") return "neutral";
    return "neutral";
}

export function packetArtifactKindLabel(kind: PacketArtifactKindKey): string {
    if (kind === "generated_pdf" || kind === "submitted_record") {
        return artifactKindDisplayLabel(kind);
    }
    return kind.replace(/_/g, " ");
}

export function packetArtifactKindTone(kind: PacketArtifactKindKey): FormsReviewBadgeTone {
    if (kind === "generated_pdf") return "success";
    if (kind === "submitted_record") return "info";
    return "neutral";
}

export function generationLabelTone(label: "current" | "also_generated"): FormsReviewBadgeTone {
    return label === "current" ? "success" : "neutral";
}

export function generationLabelOperatorText(label: "current" | "also_generated"): string {
    return generationLabelDisplay(label);
}

export function warningPresentationTone(kind: string | undefined): FormsReviewBadgeTone {
    if (kind === "missing_info") return "attention";
    return "warning";
}

/** Operator-facing label for rollup warning `kind` (not field paths). */
export function warningKindPresentationLabel(kind: string | undefined): string {
    switch (kind) {
        case "submitted_text_differs_from_crm":
            return "Differs from records";
        case "missing_info":
            return "Missing information";
        default:
            return "Review hint";
    }
}

/** Ordered section ids for UX-D hierarchy tests. */
export const CASE_FILE_SECTION_ORDER = [
    FORMS_CASE_FILE_SECTION.header,
    FORMS_CASE_FILE_SECTION.intakeContext,
    FORMS_CASE_FILE_SECTION.bosSummary,
    FORMS_CASE_FILE_SECTION.whatChanged,
    FORMS_CASE_FILE_SECTION.needsAttention,
    FORMS_CASE_FILE_SECTION.submittedForms,
    FORMS_CASE_FILE_SECTION.documents,
    FORMS_CASE_FILE_SECTION.reviewActions,
    FORMS_CASE_FILE_SECTION.technical,
] as const;

/** Operator-facing provenance line (delegates to packet provenance formatter). */
export function formatFormsProvenanceLine(provenance: DocumentProvenanceV1): string {
    return formatPacketDocumentProvenanceLine(provenance);
}

/** Matches review PATCH gate on completed sessions. */
export function isPacketReviewAwaitingDecision(
    sessionStatus: string,
    operatorReviewStatus: string | null
): boolean {
    return (
        sessionStatus === "completed" &&
        (operatorReviewStatus == null ||
            operatorReviewStatus === "needs_review" ||
            operatorReviewStatus === "needs_correction")
    );
}

/** Copy for empty review assist (UX-H / P2-5). */
export const BOS_REVIEW_SUMMARY_PLACEHOLDER_TITLE = "Review assist";
export const BOS_REVIEW_SUMMARY_PLACEHOLDER_BODY =
    "When enabled, a short read-only summary will highlight progress, attention items, and differences from known records. Submitted answers remain authoritative.";

/** Shared empty-state copy */
export const FORMS_REVIEW_EMPTY = {
    noDocuments: "No documents or submitted records for this review yet.",
    noArtifacts: "No generated PDFs or submitted records yet.",
    noWarnings: "No name or context hints flagged.",
    noSteps: "No steps in this packet.",
} as const;

export const FORMS_REVIEW_LOADING = {
    packetReview: "Loading review case file…",
    documents: "Loading documents…",
} as const;

export const FORMS_REVIEW_ERROR = {
    packetReviewDefault: "Could not load packet review.",
    reviewUnavailable: "Review is unavailable for this session.",
} as const;

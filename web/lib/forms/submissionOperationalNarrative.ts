/**
 * Operational intake narrative for workload rows (OI-4).
 * Explains what happened, what is blocked, and what the operator should do next.
 */

import {
    resolveSubmissionInboxLane,
    submissionInboxPrimaryAction,
    type SubmissionInboxLaneKey,
    type SubmissionInboxRow,
} from "@/lib/forms/submissionInboxPresentation";

export type SubmissionOperationalNarrative = {
    /** Primary operational headline — what happened */
    headline: string;
    /** Secondary line — blocker or status detail */
    detail: string;
    /** Imperative next step for the operator */
    operatorAction: string;
    lane: SubmissionInboxLaneKey;
};

function metaRecord(payloadMeta: unknown): Record<string, unknown> {
    if (!payloadMeta || typeof payloadMeta !== "object" || Array.isArray(payloadMeta)) return {};
    return payloadMeta as Record<string, unknown>;
}

function opportunityMatchLabel(match: string): string | null {
    switch (match) {
        case "created":
            return "New enrollment inquiry created";
        case "attached_existing":
            return "Attached to active enrollment inquiry";
        case "ambiguous":
            return "Multiple open inquiries — pick the correct one";
        default:
            return null;
    }
}

/** Deterministic operational copy from intake meta + inbox lane. */
export function deriveSubmissionOperationalNarrative(row: SubmissionInboxRow): SubmissionOperationalNarrative {
    const lane = resolveSubmissionInboxLane(row);
    const m = metaRecord(row.payload?.meta);
    const path = typeof m.intake_resolution_path === "string" ? m.intake_resolution_path.trim() : "";
    const match = typeof m.intake_opportunity_match === "string" ? m.intake_opportunity_match.trim() : "";
    const needsReview = m.intake_needs_review === true;
    const reviewResult = typeof m.intake_review_result === "string" ? m.intake_review_result.trim() : "";
    const reason = typeof m.intake_review_reason === "string" && m.intake_review_reason.trim() ? m.intake_review_reason.trim() : null;

    const primaryAction = submissionInboxPrimaryAction(lane);
    const oppLabel = opportunityMatchLabel(match);

    let headline = "Form submitted — intake recorded";
    let detail = reason ?? "Submitted intake recorded for operator review.";
    let operatorAction =
        lane === "recentlySubmitted" && !needsReview ? "Open to finalize" : primaryAction.label;

    if (row.status === "draft") {
        return {
            headline: "Family still completing this form",
            detail: "Draft saved — not yet submitted for intake processing.",
            operatorAction: "Monitor until submit",
            lane,
        };
    }

    if (path === "created_records" || (path === "matched_email" && match === "created")) {
        headline = "New family intake created CRM records";
        detail =
            reason ??
            "Person, household, and opportunity were created or linked from this embed submit.";
        operatorAction = needsReview ? "Confirm linkage, then generate document" : "Review answers and generate document";
    } else if (match === "attached_existing" || path === "matched_email") {
        headline = "Existing opportunity matched by guardian email";
        detail =
            reason ??
            "Intake attached this submission to an open inquiry — no duplicate opportunity created.";
        operatorAction = needsReview ? "Confirm linkage before outputs" : "Open to finalize or generate document";
    } else if (path === "matched_phone") {
        headline = "Person matched by phone — verify identity";
        detail = reason ?? "CRM linked by phone match; confirm the correct guardian before outputs.";
        operatorAction = needsReview ? "Confirm identity and linkage" : "Review and generate document";
    } else if (path === "ambiguous_contact") {
        headline = "Intake could not confidently link the contact";
        detail = "Multiple CRM persons match — pick the correct records before any document output.";
        operatorAction = "Correct linked records";
    } else if (path === "ambiguous_opportunity") {
        headline = "Multiple open opportunities match this family";
        detail = "Guardian + child + location match more than one inquiry — link manually.";
        operatorAction = "Correct opportunity link";
    } else if (path === "needs_human_review") {
        headline = "Review required before downstream enrollment workflows";
        detail = reason ?? "Intake stopped short of auto-linking — operator must choose CRM records.";
        operatorAction = "Link or confirm records";
    } else if (path === "manually_linked") {
        headline = "Operator corrected CRM linkage";
        detail = reviewResult === "corrected" ? "Manual link applied — verify before generating outputs." : detail;
        operatorAction = "Open case file";
    } else if (path === "skipped_intake_disabled" || path === "skipped_missing_config") {
        headline = "Submission stored — CRM intake did not run";
        detail = reason ?? "Public link missing intake configuration; link CRM records manually if needed.";
        operatorAction = "Link records or fix distribution link";
    } else if (lane === "needsLinking") {
        headline = "Submitted intake missing CRM attach targets";
        detail = reason ?? "No person, household, member, or opportunity linked yet.";
        operatorAction = "Link CRM records";
    } else if (lane === "needsReview") {
        headline = "Auto-linked intake needs operator confirmation";
        detail = reason ?? "CRM rows were attached but intake flagged human review.";
        operatorAction = "Confirm linkage";
    } else if (lane === "recentlySubmitted") {
        headline = oppLabel ?? "Submitted intake ready for outputs";
        detail =
            reviewResult === "confirmed" ?
                "Linkage confirmed — generate document or continue enrollment workflow."
            :   "Linked and clear — review answers or generate document.";
        operatorAction = "Open to finalize";
    }

    if (oppLabel && !headline.includes("inquiry") && !headline.includes("opportunity")) {
        detail = `${oppLabel}. ${detail}`;
    }

    return { headline, detail, operatorAction, lane };
}

export function submissionActivitySortKey(row: SubmissionInboxRow): string {
    return row.submitted_at ?? row.created_at ?? "";
}

export function sortSubmissionsByActivity(rows: SubmissionInboxRow[]): SubmissionInboxRow[] {
    return [...rows].sort((a, b) => submissionActivitySortKey(b).localeCompare(submissionActivitySortKey(a)));
}

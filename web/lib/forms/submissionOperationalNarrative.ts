/**
 * Operational intake narrative for workload rows (OI-4 / sprint closeout).
 * Operator-first language — intake-case oriented, not technical CRM jargon.
 */

import {
    isCleanCreatedEnrollmentLead,
    isCleanOperationalizedEnrollmentLead,
} from "@/lib/forms/intakeEnrollmentLeadClassification";
import {
    resolveSubmissionInboxLane,
    submissionInboxAttachRow,
    submissionInboxPrimaryAction,
    type SubmissionInboxLaneKey,
    type SubmissionInboxRow,
} from "@/lib/forms/submissionInboxPresentation";

export type SubmissionOperationalNarrative = {
    headline: string;
    detail: string;
    operatorAction: string;
    lane: SubmissionInboxLaneKey;
    /** Short status for modal badge */
    statusLabel: string;
};

function metaRecord(payloadMeta: unknown): Record<string, unknown> {
    if (!payloadMeta || typeof payloadMeta !== "object" || Array.isArray(payloadMeta)) return {};
    return payloadMeta as Record<string, unknown>;
}

function payloadValues(row: SubmissionInboxRow): Record<string, unknown> {
    const payload = row.payload as Record<string, unknown> | undefined;
    const values = payload?.values;
    if (!values || typeof values !== "object" || Array.isArray(values)) return {};
    return values as Record<string, unknown>;
}

/** Guardian or child name for workload row lead-in. */
export function submissionFamilyLabel(row: SubmissionInboxRow): string | null {
    const v = payloadValues(row);
    const guardian = typeof v.guardian_full_name === "string" ? v.guardian_full_name.trim() : "";
    if (guardian) return guardian;
    const first = typeof v.child_first_name === "string" ? v.child_first_name.trim() : "";
    const last = typeof v.child_last_name === "string" ? v.child_last_name.trim() : "";
    const child = [first, last].filter(Boolean).join(" ");
    return child || null;
}

/** Human summary of what intake created or matched — not raw FK ids. */
export function submissionCreatedOrMatchedSummary(row: SubmissionInboxRow): string | null {
    const m = metaRecord(row.payload?.meta);
    const match = typeof m.intake_opportunity_match === "string" ? m.intake_opportunity_match.trim() : "";
    const path = typeof m.intake_resolution_path === "string" ? m.intake_resolution_path.trim() : "";

    if (match === "attached_existing" || path === "matched_email") {
        if (m.intake_identity_name_mismatch === true) {
            return "Needs review: Possible existing family match";
        }
        return "Matched: Existing enrollment lead";
    }
    if (match === "ambiguous" || path === "ambiguous_opportunity" || path === "ambiguous_contact") {
        return "Needs review: Potential duplicate";
    }
    if (path === "skipped_intake_disabled" || path === "skipped_missing_config") {
        return null;
    }

    const created: string[] = [];
    if (row.opportunity_id) created.push("Enrollment lead");
    if (row.person_id) created.push("Parent profile");
    if (row.customer_id && !row.person_id) created.push("Family profile");
    if (row.customer_member_id) created.push("Child profile");
    if (created.length === 0) return null;
    return `Created: ${created.join(", ")}`;
}

/** @deprecated Prefer submissionCreatedOrMatchedSummary */
export function formatIntakeRecordsSummary(row: SubmissionInboxRow): string | null {
    return submissionCreatedOrMatchedSummary(row);
}

function statusLabelForLane(
    lane: SubmissionInboxLaneKey,
    needsReview: boolean,
    cleanLead: boolean
): string {
    if (cleanLead) return "New lead";
    if (lane === "needsLinking") return "Missing family match";
    if (lane === "needsReview" || needsReview) return "Ready for enrollment review";
    if (lane === "recentlySubmitted") return "Ready to continue enrollment";
    if (lane === "drafts") return "In progress";
    return "Intake submitted";
}

/** Deterministic operational copy from intake meta + inbox lane. */
export function deriveSubmissionOperationalNarrative(row: SubmissionInboxRow): SubmissionOperationalNarrative {
    const lane = resolveSubmissionInboxLane(row);
    const m = metaRecord(row.payload?.meta);
    const path = typeof m.intake_resolution_path === "string" ? m.intake_resolution_path.trim() : "";
    const match = typeof m.intake_opportunity_match === "string" ? m.intake_opportunity_match.trim() : "";
    const needsReview = m.intake_needs_review === true;
    const attachRow = submissionInboxAttachRow(row);
    const cleanLead = isCleanOperationalizedEnrollmentLead({
        status: row.status,
        payloadMeta: m,
        attachRow,
    });
    const cleanCreatedLead = isCleanCreatedEnrollmentLead({
        status: row.status,
        payloadMeta: m,
        attachRow,
    });

    const primaryAction = submissionInboxPrimaryAction(lane);

    let headline = "Intake submitted";
    let detail = "Form answers saved — review when ready.";
    let operatorAction =
        lane === "recentlySubmitted" && !needsReview ?
            "Continue enrollment"
        :   primaryAction.label;

    if (row.status === "draft") {
        return {
            headline: "Family still completing",
            detail: "Draft saved — not submitted yet.",
            operatorAction: "Monitor until submit",
            lane,
            statusLabel: "In progress",
        };
    }

    if (cleanCreatedLead) {
        headline = "Lead created";
        detail = "A new enrollment lead was created from this submission.";
        operatorAction = "Open lead";
    } else if (m.intake_identity_name_mismatch === true) {
        const submitted = submissionFamilyLabel(row);
        const matched =
            typeof m.intake_matched_person_display_name === "string" ?
                m.intake_matched_person_display_name.trim()
            :   null;
        headline = "Possible existing family match";
        detail =
            submitted && matched ?
                `Submitted as “${submitted}”, but email/phone matches “${matched}” in CRM — confirm before continuing.`
            :   "Submitted name differs from the existing family on this email or phone — confirm before continuing.";
        operatorAction = "Review family match";
    } else if (path === "created_records" || (path === "matched_email" && match === "created")) {
        headline = "New enrollment lead created";
        detail = "Parent, family, and enrollment lead were set up from this submission.";
        operatorAction = needsReview ? "Review intake and continue enrollment" : "Continue enrollment";
    } else if (match === "attached_existing" || (path === "matched_email" && match !== "created")) {
        headline = "Existing family matched";
        detail = "Attached to an open enrollment lead — no duplicate lead created.";
        operatorAction = needsReview ? "Review match and continue enrollment" : "Continue enrollment";
    } else if (path === "matched_phone") {
        headline = "Existing family matched";
        detail = "Matched by phone — confirm this is the correct family before continuing.";
        operatorAction = needsReview ? "Confirm family match" : "Continue enrollment";
    } else if (path === "ambiguous_contact" || path === "ambiguous_opportunity") {
        headline = "Potential duplicate found";
        detail = "More than one family or lead could match — pick the correct one.";
        operatorAction = "Resolve duplicate match";
    } else if (path === "needs_human_review") {
        headline = "Ready for enrollment review";
        detail = "Intake paused for operator — choose the correct family and lead.";
        operatorAction = "Review intake and continue enrollment";
    } else if (path === "manually_linked") {
        headline = "Family match updated";
        detail = "Operator corrected the family link — verify before generating documents.";
        operatorAction = "Open intake file";
    } else if (path === "skipped_intake_disabled" || path === "skipped_missing_config") {
        headline = "Intake not configured";
        detail = "Submission saved only — enable intake on the distribution link if CRM setup is needed.";
        operatorAction = "Fix distribution link or match manually";
    } else if (lane === "needsLinking" && !cleanLead) {
        headline = "Missing family match";
        detail = "No enrollment lead or family profile linked yet.";
        operatorAction = "Match to family profile";
    } else if (lane === "needsReview") {
        headline = "Ready for enrollment review";
        detail = "Family records linked — confirm before enrollment workflows continue.";
        operatorAction = "Review intake and continue enrollment";
    } else if (lane === "recentlySubmitted") {
        headline = match === "attached_existing" ? "Existing family matched" : "Ready to continue enrollment";
        detail =
            match === "attached_existing" ?
                "Linked to an open lead — review answers or continue enrollment."
            :   "Linked and clear — review answers or continue enrollment.";
        operatorAction = "Continue enrollment";
    }

    return {
        headline,
        detail,
        operatorAction,
        lane,
        statusLabel: statusLabelForLane(lane, needsReview, cleanLead),
    };
}

export function submissionActivitySortKey(row: SubmissionInboxRow): string {
    return row.submitted_at ?? row.created_at ?? "";
}

export function sortSubmissionsByActivity(rows: SubmissionInboxRow[]): SubmissionInboxRow[] {
    return [...rows].sort((a, b) => submissionActivitySortKey(b).localeCompare(submissionActivitySortKey(a)));
}

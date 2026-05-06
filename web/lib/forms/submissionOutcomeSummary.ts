import type { FormPayload } from "@/lib/forms/validateSubmission";
import { resolveFormSubmissionDocumentParent } from "@/lib/forms/pdf/createGeneratedPdfForSubmission";

/** Rows for operator-facing “records connected” summary (truthful linked / not linked). */
export type EntityConnectionRow = {
    key: string;
    label: string;
    hint: string;
    recordId: string | null;
};

export function payloadHasCapturedSignatures(payload: FormPayload | null | undefined): boolean {
    if (!payload?.signatures || typeof payload.signatures !== "object") return false;
    return Object.keys(payload.signatures).length > 0;
}

/** Operator-facing status headline + notes (timestamps formatted in UI). */
export function describeSubmissionLifecycle(params: {
    status: string;
    payloadHasSignatures: boolean;
}): { headline: string; notes: string[] } {
    const raw = (params.status ?? "").toLowerCase().trim();

    if (raw === "draft") {
        return {
            headline: "Draft",
            notes: ["Still in progress — the recipient has not finished or submitted yet."],
        };
    }

    if (raw === "submitted") {
        const notes: string[] = [];
        if (params.payloadHasSignatures) {
            notes.push("At least one signature was captured on this submission.");
        }
        return { headline: "Submitted", notes };
    }

    return {
        headline: params.status ? params.status : "Unknown status",
        notes: [`Recorded status code: ${params.status}`],
    };
}

export function buildEntityConnectionRows(sub: {
    person_id: string | null;
    customer_id: string | null;
    customer_member_id: string | null;
    opportunity_id: string | null;
    created_via_public_link_id: string | null;
}): EntityConnectionRow[] {
    return [
        {
            key: "person",
            label: "Person",
            hint: "Individual profile (often the guardian or contact).",
            recordId: sub.person_id,
        },
        {
            key: "customer",
            label: "Customer",
            hint: "Household / bill-to account in CRM.",
            recordId: sub.customer_id,
        },
        {
            key: "customer_member",
            label: "Customer member (child)",
            hint: "Child or dependent profile under the customer.",
            recordId: sub.customer_member_id,
        },
        {
            key: "opportunity",
            label: "Opportunity",
            hint: "Enrollment or pipeline record when linked.",
            recordId: sub.opportunity_id,
        },
        {
            key: "public_link",
            label: "Public link",
            hint: "Which shareable link started this submission (if any).",
            recordId: sub.created_via_public_link_id,
        },
    ];
}

export const WORKFLOW_SIGNALS_OPERATOR_COPY =
    "When this submission moves through its lifecycle, Alloy emits workflow signals (for example when it is submitted, when signatures are saved, or when a linked document is generated). Automations you configure can listen for those signals — live event history from this screen is not shown yet.";

export type IntakeOperatorSummary = {
    /** Short label for badges: Linked / Needs review / Skipped / Error */
    statusLabel: string;
    /** Plain-language match / policy outcome */
    strategyLabel: string;
    detailLines: string[];
};

const STRATEGY_LABELS: Record<string, string> = {
    matched_email: "Matched existing person by email (single unambiguous row).",
    matched_phone: "Matched existing person by phone (single unambiguous row).",
    created_person: "Created a new person from the form (auto_create_person enabled).",
    reuse_submission_person_id: "Continued from person id already stored on this submission.",
    ambiguous_email: "Multiple persons matched the email — CRM links were not applied.",
    ambiguous_phone: "Multiple persons matched the phone — CRM links were not applied.",
    no_match: "No person matched email/phone.",
};

/** Structured intake summary for submission detail (Card 8 metadata). */
export function buildIntakeOperatorSummary(payloadMeta: unknown): IntakeOperatorSummary | null {
    if (!payloadMeta || typeof payloadMeta !== "object" || Array.isArray(payloadMeta)) return null;
    const m = payloadMeta as Record<string, unknown>;
    const path = typeof m.intake_resolution_path === "string" ? m.intake_resolution_path.trim() : "";
    if (!path) return null;

    const rawStrategy = typeof m.intake_match_strategy === "string" ? m.intake_match_strategy.trim() : "";
    const strategyLabel = STRATEGY_LABELS[rawStrategy] ?? (rawStrategy ? `Strategy: ${rawStrategy}` : "Strategy recorded.");
    const confidence = typeof m.intake_match_confidence === "string" ? m.intake_match_confidence : "—";
    const needsReview = m.intake_needs_review === true;
    const ec = m.intake_candidate_email_count;
    const pc = m.intake_candidate_phone_count;

    let statusLabel = "Linked";
    if (path === "skipped_missing_config") statusLabel = "Skipped";
    else if (path === "skipped_error") statusLabel = "Error";
    else if (path === "ambiguous_contact" || path === "needs_human_review") statusLabel = "Needs review";
    else if (needsReview) statusLabel = "Needs review";

    const detailLines: string[] = [`Resolution path: ${path}.`, `Confidence: ${confidence}.`, strategyLabel];

    if (typeof ec === "number" || typeof pc === "number") {
        detailLines.push(
            `Person lookup candidates — email: ${typeof ec === "number" ? ec : "—"}, phone: ${typeof pc === "number" ? pc : "—"}.`
        );
    }

    const rr = typeof m.intake_review_reason === "string" && m.intake_review_reason.trim();
    if (rr) detailLines.push(rr);

    if (path === "skipped_missing_config") {
        detailLines.push(
            "This form is not configured to create/link records yet, or the public link is missing required intake settings."
        );
        const detail = typeof m.intake_skip_reason === "string" && m.intake_skip_reason.trim();
        if (detail) detailLines.push(`Detail: ${detail}`);
    }

    if (path === "skipped_error") {
        detailLines.push("CRM intake hit an error on submit — the submission was still saved.");
        const err = typeof m.intake_error === "string" && m.intake_error.trim();
        if (err) detailLines.push(`Detail: ${err}`);
    }

    if (path === "ambiguous_contact") {
        detailLines.push("Do not generate a document until the correct person or household is linked manually.");
    }

    if (needsReview && path !== "ambiguous_contact" && path !== "skipped_missing_config" && path !== "skipped_error") {
        detailLines.push(
            "Do not generate a document until you confirm CRM linkage is correct for this submission."
        );
    }

    return { statusLabel, strategyLabel, detailLines };
}

/** Operator-facing notes from submit-time CRM intake (stored on `payload.meta`). */
export function intakeFollowUpNotes(payloadMeta: unknown): string[] {
    return buildIntakeOperatorSummary(payloadMeta)?.detailLines ?? [];
}

export type SubmissionAttachRow = {
    person_id: string | null;
    customer_id: string | null;
    customer_member_id: string | null;
    opportunity_id: string | null;
};

/** True when stub PDF can attach to a CRM parent row. */
export function submissionHasDocumentAttachTarget(row: SubmissionAttachRow): boolean {
    return resolveFormSubmissionDocumentParent(row) !== null;
}

/**
 * Blocks Generate document when intake policy requires human verification or no attach parent exists.
 */
export function documentGenerationBlockedByIntake(
    payloadMeta: unknown,
    row: SubmissionAttachRow
): { blocked: boolean; reason?: string } {
    if (!payloadMeta || typeof payloadMeta !== "object" || Array.isArray(payloadMeta)) {
        if (!submissionHasDocumentAttachTarget(row)) {
            return {
                blocked: true,
                reason: "Link this submission to a person, customer, customer member, or opportunity before generating a document.",
            };
        }
        return { blocked: false };
    }
    const m = payloadMeta as Record<string, unknown>;
    const path = typeof m.intake_resolution_path === "string" ? m.intake_resolution_path.trim() : "";

    if (path === "ambiguous_contact" || path === "needs_human_review") {
        return {
            blocked: true,
            reason: "CRM intake requires human review — do not generate a document until records are linked correctly.",
        };
    }

    if (m.intake_needs_review === true) {
        return {
            blocked: true,
            reason: "Do not generate a document until this submission is linked to the correct CRM records.",
        };
    }

    if (!submissionHasDocumentAttachTarget(row)) {
        return {
            blocked: true,
            reason: "Link this submission to a person, customer, customer member, or opportunity before generating a document.",
        };
    }

    return { blocked: false };
}

export type DocumentOutcomeOperator = {
    headline: string;
    bullets: string[];
};

export function describeDocumentOutcome(params: {
    linkedDocumentsCount: number;
    submissionStatus: string;
    canMutate: boolean;
}): DocumentOutcomeOperator {
    const submitted = params.submissionStatus.toLowerCase() === "submitted";
    if (params.linkedDocumentsCount > 0) {
        return {
            headline: "Document stored",
            bullets: [
                `${params.linkedDocumentsCount} linked document${params.linkedDocumentsCount === 1 ? "" : "s"} on file for this submission.`,
                "Open a document below to review it in the documents drawer.",
            ],
        };
    }
    if (!submitted) {
        return {
            headline: "No document yet",
            bullets: [
                "Documents are created after submit using Generate document (stub PDF today).",
                "Wait until the form is submitted before generating.",
            ],
        };
    }
    if (params.canMutate) {
        return {
            headline: "No document generated yet",
            bullets: [
                "Use Generate document below to create or reuse a PDF from this submission’s published mapping.",
                "That stores a documents row and links it here when your environment supports it.",
            ],
        };
    }
    return {
        headline: "No document generated yet",
        bullets: [
            "An admin can generate the PDF from this submission when your form has a document mapping.",
            "Ask an administrator if you need a document on file.",
        ],
    };
}

export function recommendedNextAction(params: {
    status: string;
    linkedDocumentsCount: number;
    canMutate: boolean;
    hasAnyCrmEntityLink: boolean;
}): string[] {
    const raw = params.status.toLowerCase();
    const lines: string[] = [];

    if (raw === "draft") {
        lines.push("Wait for the recipient to finish and submit — drafts do not drive downstream documents until submitted.");
        return lines;
    }

    if (raw !== "submitted") {
        lines.push("Confirm submission status with your team before processing.");
        return lines;
    }

    if (params.linkedDocumentsCount === 0) {
        lines.push("Review the answers, then generate a document when your process requires a PDF on file.");
        if (!params.canMutate) {
            lines.push("You need an admin to run Generate document if this submission still has no linked document.");
        }
    } else {
        lines.push("Open the linked document(s) or continue your internal workflow.");
    }

    if (params.hasAnyCrmEntityLink) {
        lines.push("Use Open beside Person / Customer / Member / Opportunity when you need to update CRM records.");
    }

    return lines;
}

import type { FormPayload } from "@/lib/forms/validateSubmission";
import { resolveFormSubmissionDocumentParent } from "@/lib/forms/pdf/createGeneratedPdfForSubmission";
import { parseIntakeAutoCreateFlags } from "@/lib/forms/intake/parseIntakeAutoCreateFlags";
import { linkRequiresLeadCapture } from "@/lib/public/forms/publicFormTypes";

/** Safe, non-secret snapshot of public link metadata for operators (submission debug). */
export type PublicLinkIntakeDebug = {
    public_link_id: string | null;
    lead_capture: boolean;
    default_vertical_id: string | null;
    auto_create_person: boolean;
    auto_create_customer: boolean;
    auto_create_customer_member: boolean;
    auto_create_opportunity: boolean;
    link_label: string | null;
    alloy_admin_preview: boolean;
};

export function buildPublicLinkIntakeDebug(
    metadata: Record<string, unknown> | null | undefined,
    linkId: string | null
): PublicLinkIntakeDebug {
    const m = metadata ?? {};
    const flags = parseIntakeAutoCreateFlags(m);
    const vid = typeof m.default_vertical_id === "string" ? m.default_vertical_id.trim() : "";
    const default_vertical_id = /^[0-9a-f-]{36}$/i.test(vid) ? vid : null;
    return {
        public_link_id: linkId,
        lead_capture: linkRequiresLeadCapture(m),
        default_vertical_id,
        auto_create_person: flags.auto_create_person,
        auto_create_customer: flags.auto_create_customer,
        auto_create_customer_member: flags.auto_create_customer_member,
        auto_create_opportunity: flags.auto_create_opportunity,
        link_label: typeof m.label === "string" && m.label.trim() ? m.label.trim() : null,
        alloy_admin_preview: m.alloy_admin_preview === true,
    };
}

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
    else if (path === "skipped_intake_disabled") statusLabel = "Skipped";
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

    if (path === "skipped_intake_disabled") {
        detailLines.push(
            "The public link used for this submission did not have CRM intake enabled (no lead_capture / intake flags on link metadata)."
        );
        const detail = typeof m.intake_skip_reason === "string" && m.intake_skip_reason.trim();
        if (detail) detailLines.push(`Detail: ${detail}`);
        detailLines.push(
            "Fix: create a new link from Admin for this form — medication demo links automatically include intake when a cleaning vertical exists — or PATCH the link metadata to set lead_capture and default_vertical_id."
        );
    }

    if (path === "skipped_error") {
        detailLines.push("CRM intake hit an error on submit — the submission was still saved.");
        const err = typeof m.intake_error === "string" && m.intake_error.trim();
        if (err) detailLines.push(`Detail: ${err}`);
    }

    if (path === "ambiguous_contact") {
        detailLines.push("Do not generate a document until the correct person or household is linked manually.");
    }

    if (
        needsReview &&
        path !== "ambiguous_contact" &&
        path !== "skipped_missing_config" &&
        path !== "skipped_error" &&
        path !== "skipped_intake_disabled"
    ) {
        detailLines.push(
            "Do not generate a document until you confirm CRM linkage is correct for this submission."
        );
    }

    return { statusLabel, strategyLabel, detailLines };
}

/** Always-on intake card for submission detail (synthetic copy when no server intake meta). */
export type SubmissionIntakeSection = IntakeOperatorSummary & {
    /** False when payload.meta has no intake_resolution_path */
    hasServerIntakeRecord: boolean;
};

export function buildSubmissionIntakeSection(payloadMeta: unknown): SubmissionIntakeSection {
    const recorded = buildIntakeOperatorSummary(payloadMeta);
    if (recorded) {
        return { ...recorded, hasServerIntakeRecord: true };
    }
    return {
        statusLabel: "No record",
        strategyLabel: "No intake/linking result was recorded for this submission.",
        detailLines: [
            "There is no intake_resolution_path in payload.meta — Alloy did not persist a CRM intake outcome for this row.",
            "Common causes: this submission predates the skipped_intake_disabled marker; the payload was edited outside the public submit path; lead_capture was never enabled on the link; or required metadata (default_vertical_id) was missing.",
            "Check Link configuration (below) for the public link id on this submission. Use Records connected to link manually, or create a fresh intake-enabled public link and share that URL.",
        ],
        hasServerIntakeRecord: false,
    };
}

/** Operator-facing notes from submit-time CRM intake (stored on `payload.meta`). */
export function intakeFollowUpNotes(payloadMeta: unknown): string[] {
    return buildSubmissionIntakeSection(payloadMeta).detailLines;
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

    if (
        (path === "skipped_intake_disabled" || path === "skipped_missing_config") &&
        !submissionHasDocumentAttachTarget(row)
    ) {
        return {
            blocked: true,
            reason:
                "Intake did not run or could not complete — link CRM records manually or fix public link metadata (lead_capture + default_vertical_id), then generate a document.",
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
    /** When true, avoid implying Generate document is ready (intake/linking blocks). */
    documentGenerationBlocked?: boolean;
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
    if (params.documentGenerationBlocked) {
        return {
            headline: "No document generated yet",
            bullets: [
                "Document generation is blocked until CRM records are linked and intake no longer requires review.",
                "Complete linking using Records connected and Intake & record linking above, then use Generate document in Documents & PDF.",
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
    /** When provided with attachRow, avoids recommending Generate document until linkage/intake allows it. */
    payloadMeta?: unknown;
    attachRow?: SubmissionAttachRow;
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

    const attachRow: SubmissionAttachRow = params.attachRow ?? {
        person_id: null,
        customer_id: null,
        customer_member_id: null,
        opportunity_id: null,
    };
    const hasAttachParent = submissionHasDocumentAttachTarget(attachRow);
    const intakeBlocksDoc =
        params.payloadMeta !== undefined && params.payloadMeta !== null ?
            documentGenerationBlockedByIntake(params.payloadMeta, attachRow).blocked
        :   !hasAttachParent;

    if (params.linkedDocumentsCount === 0) {
        if (!hasAttachParent || intakeBlocksDoc) {
            lines.push("Link this submission to the correct CRM record before generating a document.");
            const sec = buildSubmissionIntakeSection(params.payloadMeta);
            const rawPath =
                params.payloadMeta &&
                typeof params.payloadMeta === "object" &&
                !Array.isArray(params.payloadMeta) &&
                typeof (params.payloadMeta as Record<string, unknown>).intake_resolution_path === "string" ?
                    String((params.payloadMeta as Record<string, unknown>).intake_resolution_path).trim()
                :   "";
            if (rawPath === "skipped_intake_disabled") {
                lines.push(
                    "This submission used a link without intake — create a new public link from the form detail page (medication demo wires intake when a cleaning vertical exists) and retire the old URL."
                );
            }
            if (sec.hasServerIntakeRecord && sec.statusLabel !== "Linked") {
                lines.push(`Intake status: ${sec.statusLabel} — see Intake & record linking above for detail.`);
            } else if (!sec.hasServerIntakeRecord) {
                lines.push(
                    "If you expected automatic linking, confirm the public link has lead_capture and default_vertical_id set, and that the contact exists once in CRM for this org."
                );
            }
            if (!params.canMutate) {
                lines.push("You need an admin to generate a PDF once records are linked.");
            }
        } else {
            lines.push("Review the answers, then generate a document when your process requires a PDF on file.");
            if (!params.canMutate) {
                lines.push("You need an admin to run Generate document if this submission still has no linked document.");
            }
        }
    } else {
        lines.push("Open the linked document(s) or continue your internal workflow.");
    }

    if (params.hasAnyCrmEntityLink) {
        lines.push("Use Open beside Person / Customer / Member / Opportunity when you need to update CRM records.");
    }

    return lines;
}

import {
    documentGenerationBlockedByIntake,
    submissionHasDocumentAttachTarget,
    type SubmissionAttachRow,
} from "@/lib/forms/submissionOutcomeSummary";

export type SubmissionListLinkageBadge =
    | { kind: "none" }
    | { kind: "needs_review"; tooltip: string }
    | { kind: "needs_crm_link"; tooltip: string };

function metaRecord(payloadMeta: unknown): Record<string, unknown> {
    if (!payloadMeta || typeof payloadMeta !== "object" || Array.isArray(payloadMeta)) return {};
    return payloadMeta as Record<string, unknown>;
}

/**
 * Submissions table: surface operator attention before opening a row.
 * “Needs review” = intake flagged or ambiguous/skipped paths; “Link CRM” = missing attach parent only.
 */
export function submissionListLinkageBadge(params: {
    status: string;
    payloadMeta: unknown;
    attachRow: SubmissionAttachRow;
}): SubmissionListLinkageBadge {
    if (params.status.toLowerCase() !== "submitted") {
        return { kind: "none" };
    }
    const block = documentGenerationBlockedByIntake(params.payloadMeta, params.attachRow);
    if (!block.blocked) {
        return { kind: "none" };
    }

    const m = metaRecord(params.payloadMeta);
    const path = typeof m.intake_resolution_path === "string" ? m.intake_resolution_path.trim() : "";
    const intakeDrivenAttention =
        m.intake_needs_review === true ||
        path === "ambiguous_contact" ||
        path === "needs_human_review" ||
        path === "skipped_missing_config" ||
        path === "skipped_intake_disabled" ||
        path === "skipped_error";

    const tooltip = block.reason ?? "Linkage needs attention before document generation.";

    if (intakeDrivenAttention) {
        return { kind: "needs_review", tooltip };
    }
    return { kind: "needs_crm_link", tooltip };
}

/** Operator-facing bullet reasons for the top-of-page linkage callout (submitted + doc gen blocked). */
export function buildLinkageReviewCalloutReasons(payloadMeta: unknown, attachRow: SubmissionAttachRow): string[] {
    const block = documentGenerationBlockedByIntake(payloadMeta, attachRow);
    if (!block.blocked) {
        return [];
    }

    const m = metaRecord(payloadMeta);
    const path = typeof m.intake_resolution_path === "string" ? m.intake_resolution_path.trim() : "";
    const strategy = typeof m.intake_match_strategy === "string" ? m.intake_match_strategy.trim() : "";
    const reviewReason = typeof m.intake_review_reason === "string" ? m.intake_review_reason.trim() : "";

    const reasons: string[] = [];
    if (block.reason) reasons.push(block.reason);

    if (reviewReason && !reasons.some((r) => r.includes(reviewReason))) {
        reasons.push(reviewReason);
    }

    if (path === "matched_email" || path === "matched_phone") {
        if (m.intake_needs_review === true) {
            reasons.push(
                "Alloy linked CRM rows from the form, but intake asked for review — confirm or correct those links before generating documents."
            );
        }
    } else if (path === "ambiguous_contact") {
        reasons.push("More than one CRM contact could match — pick the correct records or correct links manually.");
    } else if (path === "needs_human_review") {
        reasons.push("Intake could not safely auto-link — choose the correct CRM records for this submission.");
    } else if (path === "skipped_intake_disabled" || path === "skipped_missing_config") {
        reasons.push(
            "Intake did not run or could not finish — link CRM records manually or fix the public link configuration, then generate the document."
        );
    } else if (path === "skipped_error") {
        reasons.push("Intake failed at submit time — verify linkage and metadata, then retry document generation when appropriate.");
    } else if (!path && !submissionHasDocumentAttachTarget(attachRow)) {
        reasons.push("No person, customer, child member, or opportunity is linked yet — document generation needs a CRM attach parent.");
    }

    if (strategy === "created_person" && m.intake_needs_review === true) {
        reasons.push("A new CRM profile may have been created from this form — verify it belongs with the right family.");
    }

    const seen = new Set<string>();
    return reasons.filter((r) => {
        const k = r.trim();
        if (!k || seen.has(k)) return false;
        seen.add(k);
        return true;
    });
}

export function submissionDetailLinkageCalloutVisible(params: {
    status: string;
    payloadMeta: unknown;
    attachRow: SubmissionAttachRow;
}): boolean {
    if (params.status.toLowerCase() !== "submitted") return false;
    return documentGenerationBlockedByIntake(params.payloadMeta, params.attachRow).blocked;
}

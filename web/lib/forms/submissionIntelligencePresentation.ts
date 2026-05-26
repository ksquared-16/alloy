/**
 * Submission intelligence — deterministic inbox row derivation (OI-2 / OI-3).
 * Bridge into BOS operational cognition without AI.
 */

import {
    documentGenerationBlockedByIntake,
    recommendedNextAction,
    submissionHasDocumentAttachTarget,
    type SubmissionAttachRow,
} from "@/lib/forms/submissionOutcomeSummary";
import {
    submissionInboxAttachRow,
    submissionInboxLinkageKind,
    type SubmissionInboxLaneKey,
    type SubmissionInboxRow,
} from "@/lib/forms/submissionInboxPresentation";

export type SubmissionReadinessTone = "ready" | "attention" | "blocked" | "waiting" | "neutral";

export type SubmissionLinkageConfidence = "high" | "medium" | "low" | "none";

export type SubmissionAccelerationCta = {
    label: string;
    kind: "review" | "link" | "generate" | "continue" | "open";
};

export type SubmissionIntelligenceView = {
    operationalSummary: string;
    readinessLabel: string;
    readinessTone: SubmissionReadinessTone;
    linkageConfidence: SubmissionLinkageConfidence;
    linkageConfidenceLabel: string;
    missingRequirements: string[];
    likelyNextAction: string;
    readyAfter: string | null;
    accelerationCta: SubmissionAccelerationCta;
};

function metaRecord(payloadMeta: unknown): Record<string, unknown> {
    if (!payloadMeta || typeof payloadMeta !== "object" || Array.isArray(payloadMeta)) return {};
    return payloadMeta as Record<string, unknown>;
}

function linkageConfidence(
    row: SubmissionInboxRow,
    attachRow: SubmissionAttachRow,
    lane: SubmissionInboxLaneKey
): { level: SubmissionLinkageConfidence; label: string } {
    if (row.status === "draft" || row.status === "void") {
        return { level: "none", label: "Not submitted" };
    }
    const kind = submissionInboxLinkageKind(row);
    if (kind === "none" && submissionHasDocumentAttachTarget(attachRow)) {
        return { level: "high", label: "Records linked" };
    }
    if (kind === "needs_review") {
        return { level: "medium", label: "Linked — needs confirmation" };
    }
    if (kind === "needs_crm_link") {
        return { level: "low", label: "Missing CRM attach" };
    }
    if (lane === "recentlySubmitted") {
        return { level: "high", label: "Clear to process" };
    }
    return { level: "medium", label: "Review recommended" };
}

function readinessForLane(lane: SubmissionInboxLaneKey, blocked: boolean): {
    label: string;
    tone: SubmissionReadinessTone;
} {
    if (lane === "drafts") return { label: "In progress", tone: "waiting" };
    if (lane === "needsReview") return { label: "Needs human review", tone: "attention" };
    if (lane === "needsLinking") return { label: "Blocked — linkage", tone: "blocked" };
    if (blocked) return { label: "Blocked — outputs", tone: "blocked" };
    return { label: "Ready for review", tone: "ready" };
}

function readyAfterLabel(params: {
    lane: SubmissionInboxLaneKey;
    blocked: boolean;
    attachRow: SubmissionAttachRow;
    payloadMeta: unknown;
}): string | null {
    if (params.lane === "drafts") return "After family submits";
    const m = metaRecord(params.payloadMeta);
    if (m.intake_needs_review === true) return "After linkage confirmed";
    if (!submissionHasDocumentAttachTarget(params.attachRow)) return "After CRM record linked";
    if (params.blocked) return "After intake review cleared";
    return null;
}

function missingRequirements(params: {
    row: SubmissionInboxRow;
    lane: SubmissionInboxLaneKey;
    blocked: boolean;
    attachRow: SubmissionAttachRow;
    payloadMeta: unknown;
}): string[] {
    const missing: string[] = [];
    if (params.lane === "drafts") {
        missing.push("Family has not submitted yet");
        return missing;
    }
    if (!submissionHasDocumentAttachTarget(params.attachRow)) {
        missing.push("CRM attach target (person, customer, member, or opportunity)");
    }
    const m = metaRecord(params.payloadMeta);
    if (m.intake_needs_review === true) {
        missing.push("Operator linkage confirmation");
    }
    const path = typeof m.intake_resolution_path === "string" ? m.intake_resolution_path.trim() : "";
    if (path === "ambiguous_contact" || path === "needs_human_review") {
        missing.push("Human review of ambiguous intake match");
    }
    if (params.blocked && missing.length === 0) {
        missing.push("Intake policy clearance before PDF");
    }
    return missing;
}

function accelerationCta(params: {
    lane: SubmissionInboxLaneKey;
    blocked: boolean;
    hasAttach: boolean;
}): SubmissionAccelerationCta {
    if (params.lane === "drafts") return { label: "Continue draft", kind: "continue" };
    if (params.lane === "needsLinking") return { label: "Link records", kind: "link" };
    if (params.lane === "needsReview") return { label: "Review intake now", kind: "review" };
    if (!params.blocked && params.hasAttach) return { label: "Open — ready", kind: "open" };
    return { label: "Review intake", kind: "review" };
}

function operationalSummary(params: {
    row: SubmissionInboxRow;
    lane: SubmissionInboxLaneKey;
    confidence: SubmissionLinkageConfidence;
    missing: string[];
}): string {
    const m = metaRecord(params.row.payload?.meta);
    const reason =
        typeof m.intake_review_reason === "string" && m.intake_review_reason.trim() ?
            m.intake_review_reason.trim()
        :   null;
    if (reason) return reason;
    if (params.lane === "drafts") return "Family still completing this form";
    if (params.missing.length > 0) return params.missing[0]!;
    if (params.confidence === "high") return "Submitted and linked — review or generate outputs";
    return "Submitted intake ready for operator review";
}

export function deriveSubmissionIntelligence(
    row: SubmissionInboxRow,
    lane: SubmissionInboxLaneKey
): SubmissionIntelligenceView {
    const attachRow = submissionInboxAttachRow(row);
    const payloadMeta = row.payload?.meta;
    const blocked =
        row.status === "submitted" ?
            documentGenerationBlockedByIntake(payloadMeta, attachRow).blocked
        :   false;
    const confidence = linkageConfidence(row, attachRow, lane);
    const readiness = readinessForLane(lane, blocked);
    const missing = missingRequirements({ row, lane, blocked, attachRow, payloadMeta });
    const nextLines = recommendedNextAction({
        status: row.status,
        linkedDocumentsCount: 0,
        canMutate: true,
        hasAnyCrmEntityLink: submissionHasDocumentAttachTarget(attachRow),
        payloadMeta,
        attachRow,
    });

    return {
        operationalSummary: operationalSummary({ row, lane, confidence: confidence.level, missing }),
        readinessLabel: readiness.label,
        readinessTone: readiness.tone,
        linkageConfidence: confidence.level,
        linkageConfidenceLabel: confidence.label,
        missingRequirements: missing,
        likelyNextAction: nextLines[0] ?? "Open intake review",
        readyAfter: readyAfterLabel({ lane, blocked, attachRow, payloadMeta }),
        accelerationCta: accelerationCta({
            lane,
            blocked,
            hasAttach: submissionHasDocumentAttachTarget(attachRow),
        }),
    };
}

import type { PacketReviewRollupV1 } from "@/lib/forms/packets/packetReviewRollupTypes";
import { buildPacketReviewInsightV1 } from "@/lib/forms/packets/buildPacketReviewInsightV1";
import type { PacketReviewInsightChecklistItem } from "@/lib/forms/packets/packetReviewInsightTypes";
import { bosReviewAssistFromPacketInsight } from "@/lib/forms/review/packetReviewInsightPresentation";
import type { FormsReviewBadgeTone } from "@/lib/forms/review/formsReviewPresentation";
import { operatorReviewStatusLabel } from "@/lib/forms/review/formsReviewPresentation";

/** Readiness keys derived from rollup/submission state — no AI inference. */
export type BosReviewReadinessKey =
    | "incomplete"
    | "needs_attention"
    | "awaiting_correction"
    | "ready_for_review"
    | "blocked"
    | "approved"
    | "rejected";

export type BosReviewAssistModel = {
    readinessKey: BosReviewReadinessKey;
    readinessLabel: string;
    readinessTone: FormsReviewBadgeTone;
    summary: string;
    summaryBullets?: string[];
    keyChanges: string[];
    attentionItems: string[];
    suggestedFocus: string;
    reviewPaths: string[];
    confidenceNotes?: string[];
    humanAuthorityNote?: string;
    checklist?: PacketReviewInsightChecklistItem[];
};

export type BosSubmissionReviewContext = {
    status: string;
    formTitle: string;
    linkageAttention: boolean;
    linkageReasons: string[];
    intakeStatusLabel: string | null;
    linkedDocumentsCount: number;
    recommendedActions: string[];
};

const MAX_BULLETS = 3;

export function bosReviewReadinessPresentation(key: BosReviewReadinessKey): {
    label: string;
    tone: FormsReviewBadgeTone;
} {
    switch (key) {
        case "incomplete":
            return { label: "Incomplete", tone: "info" };
        case "needs_attention":
            return { label: "Needs attention", tone: "warning" };
        case "awaiting_correction":
            return { label: "Awaiting correction", tone: "warning" };
        case "ready_for_review":
            return { label: "Ready for review", tone: "success" };
        case "blocked":
            return { label: "Blocked", tone: "error" };
        case "approved":
            return { label: "Approved", tone: "success" };
        case "rejected":
            return { label: "Rejected", tone: "error" };
        default:
            return { label: "Review", tone: "neutral" };
    }
}

function capBullets(items: string[]): string[] {
    return items.filter(Boolean).slice(0, MAX_BULLETS);
}

/** Deterministic BOS assist model from packet rollup (uses P2-5 insight builder). */
export function deriveBosPacketReviewAssist(rollup: PacketReviewRollupV1): BosReviewAssistModel {
    return bosReviewAssistFromPacketInsight(buildPacketReviewInsightV1(rollup));
}

function deriveSubmissionReadinessKey(ctx: BosSubmissionReviewContext): BosReviewReadinessKey {
    const status = ctx.status.toLowerCase();
    if (status === "draft") return "incomplete";
    if (ctx.linkageAttention) return "needs_attention";
    if (status === "submitted" && ctx.intakeStatusLabel && ctx.intakeStatusLabel !== "Linked") {
        return "needs_attention";
    }
    if (status === "submitted") return "ready_for_review";
    return "needs_attention";
}

function buildSubmissionSummary(ctx: BosSubmissionReviewContext): string {
    const title = ctx.formTitle.trim() || "This form";
    if (ctx.status.toLowerCase() === "draft") {
        return `${title} is still in draft — wait for submission before operational review.`;
    }
    if (ctx.linkageAttention) {
        return `${title} is submitted but record linkage needs your review before documents can attach safely.`;
    }
    if (ctx.linkedDocumentsCount > 0) {
        return `${title} is submitted with ${ctx.linkedDocumentsCount} linked document(s) on file.`;
    }
    return `${title} is submitted. Review answers and record connections before generating documents.`;
}

function buildSubmissionReviewPaths(ctx: BosSubmissionReviewContext, readiness: BosReviewReadinessKey): string[] {
    const paths: string[] = [];
    if (ctx.linkageAttention) paths.push("Confirm or correct CRM linkage");
    if (ctx.linkedDocumentsCount === 0) paths.push("Review answers and document readiness");
    else paths.push("Open linked documents");
    if (readiness === "ready_for_review" || readiness === "needs_attention") {
        paths.push("Generate a PDF when your process requires it");
    }
    return capBullets(paths);
}

/** Deterministic assist for standalone submission review (secondary surface). */
export function deriveBosSubmissionReviewAssist(ctx: BosSubmissionReviewContext): BosReviewAssistModel {
    const readinessKey = deriveSubmissionReadinessKey(ctx);
    const readiness = bosReviewReadinessPresentation(readinessKey);
    const keyChanges = capBullets(ctx.linkageReasons);
    const attentionItems =
        ctx.linkageAttention ?
            capBullets([
                ...ctx.linkageReasons,
                ctx.intakeStatusLabel && ctx.intakeStatusLabel !== "Linked" ?
                    `Intake status: ${ctx.intakeStatusLabel}`
                :   "",
            ])
        :   [];
    const suggestedFocus =
        ctx.recommendedActions[0]?.trim() ??
        (readinessKey === "incomplete" ?
            "Wait for submission, then review answers and linkage."
        :   "Review answers and records, then continue your document workflow.");
    return {
        readinessKey,
        readinessLabel: readiness.label,
        readinessTone: readiness.tone,
        summary: buildSubmissionSummary(ctx),
        keyChanges,
        attentionItems,
        suggestedFocus,
        reviewPaths: buildSubmissionReviewPaths(ctx, readinessKey),
    };
}

/** Generic empty assist when no rollup/submission context (should not appear on wired surfaces). */
export function deriveBosEmptyReviewAssist(): BosReviewAssistModel {
    const readiness = bosReviewReadinessPresentation("ready_for_review");
    return {
        readinessKey: "ready_for_review",
        readinessLabel: readiness.label,
        readinessTone: "neutral",
        summary:
            "When review data loads, a concise summary will orient you on progress, confidence, and suggested focus.",
        keyChanges: [],
        attentionItems: [],
        suggestedFocus: "Review submitted answers and documents below, then record your decision.",
        reviewPaths: ["Review submitted forms", "Review documents and records", "Approve or request correction"],
    };
}

export function operatorDecisionLabel(status: string | null): string {
    return operatorReviewStatusLabel(status);
}

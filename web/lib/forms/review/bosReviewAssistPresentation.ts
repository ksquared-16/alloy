import type { PacketReviewRollupV1 } from "@/lib/forms/packets/packetReviewRollupTypes";
import { buildPacketNeedsAttentionItems } from "@/lib/forms/review/packetNeedsAttentionItems";
import type { FormsReviewBadgeTone } from "@/lib/forms/review/formsReviewPresentation";
import {
    operatorReviewStatusLabel,
    warningKindPresentationLabel,
} from "@/lib/forms/review/formsReviewPresentation";

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
    keyChanges: string[];
    attentionItems: string[];
    suggestedFocus: string;
    reviewPaths: string[];
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

function derivePacketReadinessKey(rollup: PacketReviewRollupV1): BosReviewReadinessKey {
    const decision = rollup.operator_review.status;
    if (rollup.status === "cancelled") return "blocked";
    if (decision === "approved") return "approved";
    if (decision === "rejected") return "rejected";
    if (decision === "needs_correction") return "awaiting_correction";
    if (rollup.status === "in_progress") return "incomplete";
    if (rollup.progress.submitted_steps < rollup.progress.total_steps) return "incomplete";

    const attention = buildPacketNeedsAttentionItems(rollup);
    if (attention.length > 0 || rollup.operator_review.warnings.length > 0) {
        return "needs_attention";
    }
    if (rollup.status === "completed" && (decision == null || decision === "needs_review")) {
        return "ready_for_review";
    }
    return "needs_attention";
}

function buildPacketSummary(rollup: PacketReviewRollupV1): string {
    const { progress, packet_definition: def, status } = rollup;
    const name = def.name?.trim() || "This packet";
    if (status === "in_progress" || progress.submitted_steps < progress.total_steps) {
        return `${progress.submitted_steps} of ${progress.total_steps} steps submitted for ${name}. Complete intake before final review.`;
    }
    const decision = rollup.operator_review.status;
    if (decision === "approved") {
        return `${name} is approved. Submitted answers and documents remain authoritative for audit.`;
    }
    if (decision === "rejected") {
        return `${name} was rejected. Review notes and submitted records below for context.`;
    }
    if (decision === "needs_correction") {
        return `${name} is awaiting correction from the submitter or your team before re-review.`;
    }
    return `${name} is complete with ${progress.submitted_steps} submitted step(s). Review answers, linkage, and documents before you decide.`;
}

function buildPacketKeyChanges(rollup: PacketReviewRollupV1): string[] {
    return capBullets(
        rollup.operator_review.warnings.map((w) => {
            const kind = warningKindPresentationLabel(w.kind);
            return w.message.trim() ? `${kind}: ${w.message.trim()}` : kind;
        })
    );
}

function buildPacketAttentionItems(rollup: PacketReviewRollupV1): string[] {
    return capBullets(buildPacketNeedsAttentionItems(rollup).map((i) => i.message));
}

function buildPacketSuggestedFocus(rollup: PacketReviewRollupV1, readiness: BosReviewReadinessKey): string {
    if (readiness === "incomplete") {
        return "Finish remaining steps, then return here for a full review pass.";
    }
    if (readiness === "blocked") {
        return "This session was cancelled — use submitted records below for audit only.";
    }
    if (readiness === "approved" || readiness === "rejected") {
        return "Decision is recorded. Open documents or submissions if you need to verify what was on file.";
    }
    if (readiness === "awaiting_correction") {
        return "Confirm correction requests are clear, then re-open this review when resubmitted.";
    }
    const linkage = buildPacketNeedsAttentionItems(rollup);
    if (linkage.length > 0) {
        const first = linkage[0]!;
        if (first.message.toLowerCase().includes("link")) {
            return "Resolve linkage flags first — approval may stay blocked until records connect.";
        }
        return "Work through intake flags step by step before approving.";
    }
    if (rollup.operator_review.warnings.length > 0) {
        return "Compare highlighted differences with known records, then scan submitted forms.";
    }
    if (readiness === "ready_for_review") {
        return "When answers and documents look correct, approve or request correction explicitly.";
    }
    return "Review submitted forms and documents, then record your decision.";
}

function buildPacketReviewPaths(rollup: PacketReviewRollupV1, readiness: BosReviewReadinessKey): string[] {
    const paths: string[] = [];
    if (buildPacketNeedsAttentionItems(rollup).length > 0) {
        paths.push("Investigate linkage and intake flags");
    }
    if (rollup.operator_review.warnings.length > 0) {
        paths.push("Review what changed against records");
    }
    paths.push("Scan submitted forms and documents");
    if (readiness === "ready_for_review" || readiness === "needs_attention" || readiness === "awaiting_correction") {
        paths.push("Approve or request correction when satisfied");
    }
    return capBullets(paths);
}

/** Deterministic BOS assist model from packet rollup — P2-5 may replace inner bullets. */
export function deriveBosPacketReviewAssist(rollup: PacketReviewRollupV1): BosReviewAssistModel {
    const readinessKey = derivePacketReadinessKey(rollup);
    const readiness = bosReviewReadinessPresentation(readinessKey);
    return {
        readinessKey,
        readinessLabel: readiness.label,
        readinessTone: readiness.tone,
        summary: buildPacketSummary(rollup),
        keyChanges: buildPacketKeyChanges(rollup),
        attentionItems: buildPacketAttentionItems(rollup),
        suggestedFocus: buildPacketSuggestedFocus(rollup, readinessKey),
        reviewPaths: buildPacketReviewPaths(rollup, readinessKey),
    };
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

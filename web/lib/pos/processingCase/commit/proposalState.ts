import type { RelatedRecordProposalDecision } from "@/lib/intake/proposals/decisions";
import type { ExistingChildCommitPlan } from "@/lib/pos/processingCase/commit/children/types";
import type { StoredProposalCommitResult, StoredProposalDecision } from "@/lib/pos/processingCase/commit/proposalMetadata";

export type RelatedRecordProposalReviewState =
    | "unreviewed"
    | "partially_decided"
    | "ready_to_commit"
    | "partially_committed"
    | "fully_committed"
    | "blocked_by_conflict"
    | "rejected"
    | "deferred";

export function deriveRelatedRecordProposalReviewState(args: {
    decision?: StoredProposalDecision | null;
    commitResult?: StoredProposalCommitResult | null;
    plan: ExistingChildCommitPlan;
}): RelatedRecordProposalReviewState {
    const { decision, commitResult, plan } = args;
    const hasApprovedExecutable = plan.approved_changes.some((c) => c.stale_state === "clean");
    const hasStale = plan.skipped_changes.some((s) => s.outcome === "stale_conflict");
    const hasDeferred = plan.skipped_changes.some((s) => s.outcome === "deferred");
    const hasRejectedOnly = !decision && !commitResult;
    const allRejected = plan.skipped_changes.length > 0 && plan.approved_changes.length === 0
        && plan.skipped_changes.every((s) => s.outcome === "rejected" || s.outcome === "unsupported" || s.outcome === "invalid");

    if (commitResult?.status === "committed" && !hasStale && !hasDeferred && plan.approved_changes.length === 0) {
        return "fully_committed";
    }
    if (commitResult && (commitResult.status === "partial" || (commitResult.status === "committed" && (hasDeferred || hasStale)))) {
        return hasStale ? "blocked_by_conflict" : "partially_committed";
    }
    if (commitResult?.status === "blocked" && hasStale) return "blocked_by_conflict";
    if (hasStale) return "blocked_by_conflict";
    if (allRejected && decision?.instance_decision === "reject") return "rejected";
    if (!decision && hasRejectedOnly) return "unreviewed";
    if (hasDeferred && !hasApprovedExecutable) return "deferred";
    if (hasApprovedExecutable) return "ready_to_commit";
    if (decision) return "partially_decided";
    return "unreviewed";
}

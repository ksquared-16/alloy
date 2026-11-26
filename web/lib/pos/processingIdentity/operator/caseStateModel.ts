/**
 * Processing Case identity-review readiness projection (D3 §33).
 *
 * The durable `processing_cases.status` remains the single stored truth (existing
 * enum). Identity-review positions are DERIVED readiness projections (Status Truth
 * Doctrine) — never new stored statuses — so D3 introduces no duplicate/contradictory
 * status columns. This function maps durable inputs to the operator review lane.
 */

export type IdentityReviewReadiness =
    | "needs_understanding_review"
    | "needs_identity_review"
    | "needs_plan_review"
    | "ready_for_approval"
    | "approved_ready_to_commit"
    | "committing"
    | "partially_committed"
    | "committed"
    | "stale_plan"
    | "needs_information"
    | "exception";

export type ReadinessInput = {
    hasFacts: boolean;
    /** Number of subject resolutions persisted for the case. */
    resolutionCount: number;
    /** Resolutions still awaiting an operator decision. */
    undecidedResolutionCount: number;
    /** Unresolved blocking conflicts. */
    blockingConflictCount: number;
    /** Subjects that fail the canonical identity-review eligibility gate. */
    ineligibleSubjectCount?: number;
    /** A subject/plan is marked as needing more information. */
    needsInformation: boolean;
    /** Latest plan built for the case (if any). */
    plan: { exists: boolean; supersededOrStale: boolean } | null;
    /** Active, non-invalidated approval bound to the latest plan. */
    hasValidApproval: boolean;
    /** Latest commit attempt outcome. */
    latestAttemptOutcome: "committed" | "partially_committed" | "failed" | "committing" | null;
    /** Any open exception on the case. */
    hasOpenException: boolean;
};

/**
 * Derive the identity review lane. Order matters: terminal/committed and hard
 * blockers win before intermediate review lanes.
 */
export function projectIdentityReadiness(input: ReadinessInput): IdentityReviewReadiness {
    if (input.latestAttemptOutcome === "committed") return "committed";
    if (input.latestAttemptOutcome === "committing") return "committing";
    if (input.latestAttemptOutcome === "partially_committed") return "partially_committed";
    if (input.hasOpenException || input.latestAttemptOutcome === "failed") return "exception";
    if (input.needsInformation) return "needs_information";

    if (!input.hasFacts) return "needs_understanding_review";
    if (
        input.resolutionCount === 0 ||
        input.undecidedResolutionCount > 0 ||
        input.blockingConflictCount > 0 ||
        (input.ineligibleSubjectCount ?? 0) > 0
    ) {
        return "needs_identity_review";
    }
    if (!input.plan || !input.plan.exists) return "needs_plan_review";
    if (input.plan.supersededOrStale) return "stale_plan";
    if (input.hasValidApproval) return "approved_ready_to_commit";
    return "ready_for_approval";
}

/** Whether the operator may click "execute" (approved + not stale + not committed). */
export function canExecute(readiness: IdentityReviewReadiness): boolean {
    return readiness === "approved_ready_to_commit" || readiness === "partially_committed";
}

/** Whether the operator may approve now. */
export function canApprove(readiness: IdentityReviewReadiness): boolean {
    return readiness === "ready_for_approval";
}

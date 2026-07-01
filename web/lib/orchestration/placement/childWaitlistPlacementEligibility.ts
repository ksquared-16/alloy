/**
 * Child lifecycle eligibility for placement candidate creation/backfill (Card 9).
 * Does not mutate statuses or delete existing candidates.
 */

import { WAITLIST_RELEVANT_OPPORTUNITY_STATUS_KEYS } from "@/lib/orchestration/placement/placementCandidateTypes";

export type PlacementChildWaitlistEligibilityMode = "compat" | "strict";

/** `ALLOY_PLACEMENT_CHILD_WAITLIST_ELIGIBILITY_STRICT=1` → require OCM waitlisted (no opp-only fan-out). */
export function resolvePlacementChildWaitlistEligibilityMode(): PlacementChildWaitlistEligibilityMode {
    return process.env.ALLOY_PLACEMENT_CHILD_WAITLIST_ELIGIBILITY_STRICT === "1" ? "strict" : "compat";
}

export function isPlacementChildWaitlistEligibilityStrict(): boolean {
    return resolvePlacementChildWaitlistEligibilityMode() === "strict";
}

export type ChildWaitlistPlacementEligibilityReason =
    | "waitlisted"
    | "compat_opportunity_status"
    | "ineligible_status"
    | "missing_child_status_strict"
    | "opportunity_only_strict";

export type ChildWaitlistPlacementEligibilityResult = {
    eligible: boolean;
    reason: ChildWaitlistPlacementEligibilityReason;
    /** True when eligible only via opportunity-status compat (missing OCM outcome). */
    compat_opportunity_fallback?: boolean;
};

const INELIGIBLE_OUTCOME_KEYS = new Set([
    "offer_pending",
    "enrolling",
    "enrolled",
    "not_enrolling",
    "withdrawn",
]);

function isWaitlistRelevantOpportunityStatus(statusKey: string | null | undefined): boolean {
    const sk = (statusKey ?? "").trim();
    if (!sk) return false;
    return WAITLIST_RELEVANT_OPPORTUNITY_STATUS_KEYS.includes(
        sk as (typeof WAITLIST_RELEVANT_OPPORTUNITY_STATUS_KEYS)[number]
    );
}

/**
 * Whether a child inquiry row may receive a new placement candidate.
 * @param compatMode When true (default), missing OCM outcome may fall back to opportunity waitlist status.
 */
export function isChildWaitlistEligibleForPlacementCandidate(params: {
    outcomeStatusKey?: string | null;
    opportunityStatusKey?: string | null;
    compatMode?: boolean;
}): ChildWaitlistPlacementEligibilityResult {
    const outcome = (params.outcomeStatusKey ?? "").trim() || null;
    const compatMode = params.compatMode !== false;

    if (outcome === "waitlisted") {
        return { eligible: true, reason: "waitlisted" };
    }

    if (outcome && INELIGIBLE_OUTCOME_KEYS.has(outcome)) {
        return { eligible: false, reason: "ineligible_status" };
    }

    if (outcome) {
        return { eligible: false, reason: "ineligible_status" };
    }

    if (compatMode && isWaitlistRelevantOpportunityStatus(params.opportunityStatusKey)) {
        return {
            eligible: true,
            reason: "compat_opportunity_status",
            compat_opportunity_fallback: true,
        };
    }

    if (!compatMode && isWaitlistRelevantOpportunityStatus(params.opportunityStatusKey)) {
        return { eligible: false, reason: "opportunity_only_strict" };
    }

    return { eligible: false, reason: "missing_child_status_strict" };
}

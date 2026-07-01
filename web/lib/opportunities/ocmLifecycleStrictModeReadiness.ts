/**
 * Strict-mode readiness — OCM lifecycle backfill recommendations + candidate integrity (Card 12).
 * Pure logic only; no DB writes.
 */

import { buildOpportunityChildLifecycleSummary } from "@/lib/opportunities/buildOpportunityChildLifecycleSummary";
import {
    isChildWaitlistEligibleForPlacementCandidate,
    type ChildWaitlistPlacementEligibilityResult,
} from "@/lib/orchestration/placement/childWaitlistPlacementEligibility";
import { WAITLIST_RELEVANT_OPPORTUNITY_STATUS_KEYS } from "@/lib/orchestration/placement/placementCandidateTypes";

export type OcmLifecycleBackfillRecommendationKind =
    | "suggest_waitlisted"
    | "suggest_offer_pending"
    | "suggest_enrolled"
    | "manual_review_mixed"
    | "manual_review_multiple_missing"
    | "no_recommendation";

export type OcmLifecycleBackfillRecommendation = {
    ocm_id: string;
    opportunity_id: string;
    current_outcome_status_key: string | null;
    opportunity_status_key: string | null;
    suggested_outcome_status_key: string | null;
    kind: OcmLifecycleBackfillRecommendationKind;
    reason: string;
};

export type OcmAuditRowInput = {
    ocm_id: string;
    opportunity_id: string;
    outcome_status_key: string | null;
    opportunity_status_key: string | null;
};

export type CandidateAuditRowInput = {
    candidate_id: string;
    opportunity_id: string;
    opportunity_customer_member_id: string | null;
    is_synthetic_fallback: boolean;
    child_outcome_status_key: string | null;
    opportunity_status_key: string | null;
    eligibility_compat_opportunity_fallback?: boolean;
};

export type CandidateIntegrityCategory =
    | "ok_waitlisted"
    | "missing_ocm_link"
    | "missing_child_lifecycle"
    | "ineligible_child_lifecycle"
    | "compat_fallback_would_block"
    | "cleanup_review";

export type CandidateIntegrityRow = {
    candidate_id: string;
    opportunity_id: string;
    opportunity_customer_member_id: string | null;
    category: CandidateIntegrityCategory;
    child_outcome_status_key: string | null;
    opportunity_status_key: string | null;
    strict_eligibility: ChildWaitlistPlacementEligibilityResult;
    reason: string;
};

export type OpportunityLifecycleConflict = {
    opportunity_id: string;
    opportunity_status_key: string | null;
    child_lifecycle_summary: string | null;
    is_mixed: boolean;
    missing_child_status_count: number;
    reason: string;
};

export type OcmLifecycleStrictModeAuditCounts = {
    ocm_total: number;
    ocm_missing_outcome: number;
    ocm_under_waitlist_opp: number;
    ocm_under_ready_to_enroll_opp: number;
    opportunities_with_mixed_children: number;
    opportunities_with_multiple_missing: number;
    recommendations_by_kind: Record<OcmLifecycleBackfillRecommendationKind, number>;
    candidate_total: number;
    candidate_by_category: Record<CandidateIntegrityCategory, number>;
    strict_mode_blockers: number;
    opportunity_conflicts: number;
};

export type OcmLifecycleStrictModeAuditResult = {
    org_id: string;
    recommendations: OcmLifecycleBackfillRecommendation[];
    candidate_integrity: CandidateIntegrityRow[];
    opportunity_conflicts: OpportunityLifecycleConflict[];
    counts: OcmLifecycleStrictModeAuditCounts;
    strict_mode_ready: boolean;
    strict_mode_blocker_summary: string[];
};

const INELIGIBLE_FOR_CANDIDATE = new Set([
    "offer_pending",
    "enrolling",
    "enrolled",
    "not_enrolling",
    "withdrawn",
]);

function norm(raw: unknown): string | null {
    if (raw == null || raw === "") return null;
    const t = String(raw).trim();
    return t || null;
}

function isWaitlistRelevantOppStatus(status: string | null): boolean {
    if (!status) return false;
    return WAITLIST_RELEVANT_OPPORTUNITY_STATUS_KEYS.includes(
        status as (typeof WAITLIST_RELEVANT_OPPORTUNITY_STATUS_KEYS)[number]
    );
}

/** Suggest OCM outcome for one row with missing lifecycle (Card 12 rules). */
export function recommendOcmLifecycleBackfillForMissingRow(params: {
    ocmId: string;
    opportunityId: string;
    opportunityStatusKey: string | null;
    siblingMissingCount: number;
    siblingTotalCount: number;
    siblingsMixed: boolean;
}): OcmLifecycleBackfillRecommendation {
    const base = {
        ocm_id: params.ocmId,
        opportunity_id: params.opportunityId,
        current_outcome_status_key: null as string | null,
        opportunity_status_key: params.opportunityStatusKey,
        suggested_outcome_status_key: null as string | null,
    };

    if (params.siblingMissingCount > 1) {
        return {
            ...base,
            kind: "manual_review_multiple_missing",
            reason: `${params.siblingMissingCount} children missing outcome on this opportunity — manual review`,
        };
    }

    if (params.siblingsMixed && params.siblingTotalCount > 1) {
        return {
            ...base,
            kind: "manual_review_mixed",
            reason: "Mixed sibling lifecycle states — manual review before backfill",
        };
    }

    const opp = norm(params.opportunityStatusKey);
    if (opp === "waitlisted") {
        return {
            ...base,
            suggested_outcome_status_key: "waitlisted",
            kind: "suggest_waitlisted",
            reason: "Opportunity waitlisted; single child missing outcome → suggest waitlisted",
        };
    }
    if (opp === "ready_to_enroll") {
        return {
            ...base,
            suggested_outcome_status_key: "offer_pending",
            kind: "suggest_offer_pending",
            reason: "Opportunity ready_to_enroll; single child missing outcome → suggest offer_pending",
        };
    }
    if (opp === "enrolled") {
        return {
            ...base,
            suggested_outcome_status_key: "enrolled",
            kind: "suggest_enrolled",
            reason: "Opportunity enrolled; single child missing outcome → suggest enrolled",
        };
    }

    return {
        ...base,
        kind: "no_recommendation",
        reason: opp
            ? `Opportunity status '${opp}' — no automatic OCM lifecycle recommendation`
            : "Missing opportunity status — no automatic recommendation",
    };
}

export function buildOcmLifecycleBackfillRecommendations(
    rows: OcmAuditRowInput[]
): OcmLifecycleBackfillRecommendation[] {
    const byOpp = new Map<string, OcmAuditRowInput[]>();
    for (const row of rows) {
        const list = byOpp.get(row.opportunity_id) ?? [];
        list.push(row);
        byOpp.set(row.opportunity_id, list);
    }

    const out: OcmLifecycleBackfillRecommendation[] = [];
    for (const [opportunityId, ocmRows] of byOpp) {
        const siblingTotalCount = ocmRows.length;
        const missingRows = ocmRows.filter((r) => !norm(r.outcome_status_key));
        const siblingMissingCount = missingRows.length;
        const presentStatuses = new Set(
            ocmRows.map((r) => norm(r.outcome_status_key)).filter(Boolean) as string[]
        );
        const siblingsMixed = presentStatuses.size > 1 || (presentStatuses.size >= 1 && siblingMissingCount > 0);

        for (const row of ocmRows) {
            if (norm(row.outcome_status_key)) continue;
            out.push(
                recommendOcmLifecycleBackfillForMissingRow({
                    ocmId: row.ocm_id,
                    opportunityId,
                    opportunityStatusKey: row.opportunity_status_key,
                    siblingMissingCount,
                    siblingTotalCount,
                    siblingsMixed,
                })
            );
        }
    }
    return out;
}

export function classifyPlacementCandidateIntegrity(row: CandidateAuditRowInput): CandidateIntegrityRow {
    const childStatus = norm(row.child_outcome_status_key);
    const oppStatus = norm(row.opportunity_status_key);
    const strictEligibility = isChildWaitlistEligibleForPlacementCandidate({
        outcomeStatusKey: childStatus,
        opportunityStatusKey: oppStatus,
        compatMode: false,
    });

    if (!row.opportunity_customer_member_id && !row.is_synthetic_fallback) {
        return {
            candidate_id: row.candidate_id,
            opportunity_id: row.opportunity_id,
            opportunity_customer_member_id: null,
            category: "missing_ocm_link",
            child_outcome_status_key: childStatus,
            opportunity_status_key: oppStatus,
            strict_eligibility: strictEligibility,
            reason: "Placement candidate has no linked OCM row",
        };
    }

    if (row.is_synthetic_fallback && !row.opportunity_customer_member_id) {
        return {
            candidate_id: row.candidate_id,
            opportunity_id: row.opportunity_id,
            opportunity_customer_member_id: null,
            category: "missing_ocm_link",
            child_outcome_status_key: childStatus,
            opportunity_status_key: oppStatus,
            strict_eligibility: strictEligibility,
            reason: "Synthetic fallback candidate — no child row",
        };
    }

    if (!childStatus) {
        const compatEligibility = isChildWaitlistEligibleForPlacementCandidate({
            outcomeStatusKey: null,
            opportunityStatusKey: oppStatus,
            compatMode: true,
        });
        if (compatEligibility.compat_opportunity_fallback || row.eligibility_compat_opportunity_fallback) {
            return {
                candidate_id: row.candidate_id,
                opportunity_id: row.opportunity_id,
                opportunity_customer_member_id: row.opportunity_customer_member_id,
                category: "compat_fallback_would_block",
                child_outcome_status_key: null,
                opportunity_status_key: oppStatus,
                strict_eligibility: strictEligibility,
                reason: "Candidate exists via compat opportunity-status fallback; strict mode would block new fan-out",
            };
        }
        return {
            candidate_id: row.candidate_id,
            opportunity_id: row.opportunity_id,
            opportunity_customer_member_id: row.opportunity_customer_member_id,
            category: "missing_child_lifecycle",
            child_outcome_status_key: null,
            opportunity_status_key: oppStatus,
            strict_eligibility: strictEligibility,
            reason: "Linked child missing outcome_status_key",
        };
    }

    if (childStatus === "waitlisted" && strictEligibility.eligible) {
        return {
            candidate_id: row.candidate_id,
            opportunity_id: row.opportunity_id,
            opportunity_customer_member_id: row.opportunity_customer_member_id,
            category: "ok_waitlisted",
            child_outcome_status_key: childStatus,
            opportunity_status_key: oppStatus,
            strict_eligibility: strictEligibility,
            reason: "Child waitlisted — aligned with strict eligibility",
        };
    }

    if (INELIGIBLE_FOR_CANDIDATE.has(childStatus)) {
        return {
            candidate_id: row.candidate_id,
            opportunity_id: row.opportunity_id,
            opportunity_customer_member_id: row.opportunity_customer_member_id,
            category: "cleanup_review",
            child_outcome_status_key: childStatus,
            opportunity_status_key: oppStatus,
            strict_eligibility: strictEligibility,
            reason: `Child lifecycle '${childStatus}' is not waitlist-eligible — candidate cleanup review`,
        };
    }

    if (!strictEligibility.eligible) {
        return {
            candidate_id: row.candidate_id,
            opportunity_id: row.opportunity_id,
            opportunity_customer_member_id: row.opportunity_customer_member_id,
            category: "ineligible_child_lifecycle",
            child_outcome_status_key: childStatus,
            opportunity_status_key: oppStatus,
            strict_eligibility: strictEligibility,
            reason: `Child lifecycle '${childStatus}' fails strict waitlist eligibility`,
        };
    }

    return {
        candidate_id: row.candidate_id,
        opportunity_id: row.opportunity_id,
        opportunity_customer_member_id: row.opportunity_customer_member_id,
        category: "ok_waitlisted",
        child_outcome_status_key: childStatus,
        opportunity_status_key: oppStatus,
        strict_eligibility: strictEligibility,
        reason: "Eligible under strict mode",
    };
}

export function detectOpportunityLifecycleConflicts(
    rows: OcmAuditRowInput[]
): OpportunityLifecycleConflict[] {
    const byOpp = new Map<string, OcmAuditRowInput[]>();
    for (const row of rows) {
        const list = byOpp.get(row.opportunity_id) ?? [];
        list.push(row);
        byOpp.set(row.opportunity_id, list);
    }

    const conflicts: OpportunityLifecycleConflict[] = [];
    for (const [opportunityId, ocmRows] of byOpp) {
        if (!ocmRows.length) continue;
        const oppStatus = norm(ocmRows[0]?.opportunity_status_key);
        const summary = buildOpportunityChildLifecycleSummary({
            opportunityId,
            members: ocmRows.map((r) => ({ outcome_status_key: r.outcome_status_key })),
        });

        const childStatuses = ocmRows.map((r) => norm(r.outcome_status_key)).filter(Boolean) as string[];
        const hasWaitlistChild = childStatuses.some((s) => s === "waitlisted");
        const hasOfferChild = childStatuses.some((s) => s === "offer_pending" || s === "enrolling");
        const allEnrolled =
            childStatuses.length === ocmRows.length &&
            childStatuses.length > 0 &&
            childStatuses.every((s) => s === "enrolled");

        let reason: string | null = null;
        if (isWaitlistRelevantOppStatus(oppStatus) && allEnrolled) {
            reason = `Opportunity '${oppStatus}' but all children enrolled`;
        } else if (oppStatus === "enrolled" && (hasWaitlistChild || hasOfferChild)) {
            reason = "Opportunity enrolled but child still waitlisted or in offer/enrolling";
        } else if (oppStatus === "lost" && hasWaitlistChild) {
            reason = "Opportunity lost but child still waitlisted";
        } else if (
            oppStatus === "waitlisted" &&
            childStatuses.length > 0 &&
            !hasWaitlistChild &&
            !hasOfferChild &&
            summary.missing_status_count === 0
        ) {
            reason = "Opportunity waitlisted but no child in waitlist/offer lifecycle";
        }

        if (reason) {
            conflicts.push({
                opportunity_id: opportunityId,
                opportunity_status_key: oppStatus,
                child_lifecycle_summary: summary.display_summary,
                is_mixed: summary.is_mixed,
                missing_child_status_count: summary.missing_status_count,
                reason,
            });
        }
    }
    return conflicts;
}

function emptyRecommendationCounts(): Record<OcmLifecycleBackfillRecommendationKind, number> {
    return {
        suggest_waitlisted: 0,
        suggest_offer_pending: 0,
        suggest_enrolled: 0,
        manual_review_mixed: 0,
        manual_review_multiple_missing: 0,
        no_recommendation: 0,
    };
}

function emptyCandidateCategoryCounts(): Record<CandidateIntegrityCategory, number> {
    return {
        ok_waitlisted: 0,
        missing_ocm_link: 0,
        missing_child_lifecycle: 0,
        ineligible_child_lifecycle: 0,
        compat_fallback_would_block: 0,
        cleanup_review: 0,
    };
}

export function runOcmLifecycleStrictModeAuditFromRows(params: {
    orgId: string;
    ocmRows: OcmAuditRowInput[];
    candidateRows: CandidateAuditRowInput[];
}): OcmLifecycleStrictModeAuditResult {
    const recommendations = buildOcmLifecycleBackfillRecommendations(params.ocmRows);
    const candidateIntegrity = params.candidateRows.map(classifyPlacementCandidateIntegrity);
    const opportunityConflicts = detectOpportunityLifecycleConflicts(params.ocmRows);

    const recommendationsByKind = emptyRecommendationCounts();
    for (const rec of recommendations) {
        recommendationsByKind[rec.kind] += 1;
    }

    const candidateByCategory = emptyCandidateCategoryCounts();
    for (const row of candidateIntegrity) {
        candidateByCategory[row.category] += 1;
    }

    const oppIdsMixed = new Set<string>();
    const oppIdsMultiMissing = new Set<string>();
    const byOpp = new Map<string, OcmAuditRowInput[]>();
    for (const row of params.ocmRows) {
        const list = byOpp.get(row.opportunity_id) ?? [];
        list.push(row);
        byOpp.set(row.opportunity_id, list);
    }
    for (const [oppId, rows] of byOpp) {
        const missing = rows.filter((r) => !norm(r.outcome_status_key)).length;
        if (missing > 1) oppIdsMultiMissing.add(oppId);
        const statuses = new Set(rows.map((r) => norm(r.outcome_status_key)).filter(Boolean));
        if (statuses.size > 1 || (statuses.size >= 1 && missing > 0)) oppIdsMixed.add(oppId);
    }

    const blockerCategories: CandidateIntegrityCategory[] = [
        "missing_child_lifecycle",
        "ineligible_child_lifecycle",
        "compat_fallback_would_block",
        "cleanup_review",
    ];
    const strictBlockers = candidateIntegrity.filter((c) => blockerCategories.includes(c.category));
    const manualReviewRecs = recommendations.filter(
        (r) => r.kind === "manual_review_mixed" || r.kind === "manual_review_multiple_missing"
    );

    const blockerSummary: string[] = [];
    if (params.ocmRows.filter((r) => !norm(r.outcome_status_key)).length) {
        blockerSummary.push(`${params.ocmRows.filter((r) => !norm(r.outcome_status_key)).length} OCM rows missing outcome_status_key`);
    }
    if (strictBlockers.length) {
        blockerSummary.push(`${strictBlockers.length} placement candidates fail strict integrity`);
    }
    if (manualReviewRecs.length) {
        blockerSummary.push(`${manualReviewRecs.length} OCM backfill rows need manual review`);
    }
    if (opportunityConflicts.length) {
        blockerSummary.push(`${opportunityConflicts.length} opportunities with case/child lifecycle conflict`);
    }

    const counts: OcmLifecycleStrictModeAuditCounts = {
        ocm_total: params.ocmRows.length,
        ocm_missing_outcome: params.ocmRows.filter((r) => !norm(r.outcome_status_key)).length,
        ocm_under_waitlist_opp: params.ocmRows.filter((r) => r.opportunity_status_key === "waitlisted").length,
        ocm_under_ready_to_enroll_opp: params.ocmRows.filter((r) => r.opportunity_status_key === "ready_to_enroll")
            .length,
        opportunities_with_mixed_children: oppIdsMixed.size,
        opportunities_with_multiple_missing: oppIdsMultiMissing.size,
        recommendations_by_kind: recommendationsByKind,
        candidate_total: candidateIntegrity.length,
        candidate_by_category: candidateByCategory,
        strict_mode_blockers: strictBlockers.length + manualReviewRecs.length + opportunityConflicts.length,
        opportunity_conflicts: opportunityConflicts.length,
    };

    const strictModeReady =
        counts.ocm_missing_outcome === 0 &&
        strictBlockers.length === 0 &&
        manualReviewRecs.length === 0 &&
        opportunityConflicts.length === 0;

    return {
        org_id: params.orgId,
        recommendations,
        candidate_integrity: candidateIntegrity,
        opportunity_conflicts: opportunityConflicts,
        counts,
        strict_mode_ready: strictModeReady,
        strict_mode_blocker_summary: blockerSummary,
    };
}

/** Recommendations safe to apply automatically (explicit --apply only). */
export function filterApplicableOcmBackfillRecommendations(
    recommendations: OcmLifecycleBackfillRecommendation[]
): OcmLifecycleBackfillRecommendation[] {
    return recommendations.filter(
        (r) =>
            r.suggested_outcome_status_key != null &&
            (r.kind === "suggest_waitlisted" ||
                r.kind === "suggest_offer_pending" ||
                r.kind === "suggest_enrolled")
    );
}

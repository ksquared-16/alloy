/**
 * Canonical identity-review eligibility gate (authority model).
 *
 * When Processing finds a plausible existing identity match, ambiguity, or
 * contradiction, it must surface that finding and require an explicit operator
 * resolution before any create, link, or update operation is eligible for
 * approval and commit. Record creation is never the silent fallback for
 * unresolved identity.
 *
 * Source adapters may provide trusted context but may not bypass this gate.
 */

import type { IdentityCandidate } from "@/lib/identity";
import type { ProcessingResolutionRow } from "../processingResolutionsDb";
import { pickLatestResolutionPerSubject } from "./recommendationBuilder";

export type IdentityResolutionEligibilityState =
    | "confirmed_existing"
    | "confirmed_new"
    | "needs_review"
    | "conflicted"
    | "unresolved";

export type IdentityBlockingReason = {
    code: string;
    explanation: string;
    evidenceRefs: string[];
    candidateRefs?: string[];
};

export type IdentityResolutionEligibility = {
    subjectRef: string;
    subjectRole: string;
    state: IdentityResolutionEligibilityState;
    blockingReasons: IdentityBlockingReason[];
    eligibleForPlan: boolean;
    /** Operator-facing recommendation summary when needs_review / conflicted. */
    recommendationSummary: string | null;
};

export type CreateNewOverrideAudit = {
    reason: string;
    reasonCode?: string;
    rejectedCandidateIds: string[];
    decidedAt: string;
    operatorId: string;
};

export type CasePlanEligibility = {
    subjects: IdentityResolutionEligibility[];
    eligibleForPlan: boolean;
    blockers: IdentityBlockingReason[];
};

const PLAUSIBLE_BANDS = new Set(["confirmed", "strong", "possible", "weak"]);

export function isPlausibleCandidate(c: IdentityCandidate | null | undefined): boolean {
    if (!c?.recordId || c.recordId === "none" || c.recordId === "ambiguous") return false;
    return PLAUSIBLE_BANDS.has(c.confidenceBand);
}

export function plausibleCandidates(row: ProcessingResolutionRow): IdentityCandidate[] {
    return (row.candidates ?? []).filter(isPlausibleCandidate);
}

export function readCreateNewOverride(provisional: Record<string, unknown> | null | undefined): CreateNewOverrideAudit | null {
    const raw = provisional?.create_new_override;
    if (!raw || typeof raw !== "object") return null;
    const o = raw as Record<string, unknown>;
    const reason = typeof o.reason === "string" ? o.reason.trim() : "";
    if (!reason) return null;
    return {
        reason,
        reasonCode: typeof o.reasonCode === "string" ? o.reasonCode : undefined,
        rejectedCandidateIds: Array.isArray(o.rejectedCandidateIds)
            ? o.rejectedCandidateIds.map(String)
            : [],
        decidedAt: typeof o.decidedAt === "string" ? o.decidedAt : "",
        operatorId: typeof o.operatorId === "string" ? o.operatorId : "",
    };
}

function hasUnresolvedConflicts(row: ProcessingResolutionRow): boolean {
    return (row.candidates ?? []).some(
        (c) =>
            c.confidenceBand === "conflicted" ||
            (c.blockingConflicts ?? []).length > 0,
    );
}

function buildRecommendationSummary(row: ProcessingResolutionRow, state: IdentityResolutionEligibilityState): string | null {
    const candidates = plausibleCandidates(row);
    const top = candidates[0];
    if (!top && state !== "conflicted") return null;
    const supporting = (top?.signals ?? [])
        .filter((s) => s.kind === "supporting")
        .map((s) => s.explanation)
        .filter(Boolean)
        .slice(0, 4);
    const conflicting = (top?.blockingConflicts ?? []).map((b) => b.explanation).filter(Boolean);
    const lines = [
        state === "conflicted"
            ? "Recommended: Resolve conflict before create/link."
            : top
              ? `Recommended: Use existing ${row.subject_role} (${top.displayName ?? top.recordId}).`
              : "Recommended: Operator decision required.",
        top?.confidenceBand ? `Confidence: ${top.confidenceBand}` : null,
        supporting.length ? `Why: ${supporting.join("; ")}` : top?.explanation ? `Why: ${top.explanation}` : null,
        conflicting.length ? `Conflicts: ${conflicting.join("; ")}` : null,
        "Operator confirmation required before create, link, or update.",
    ].filter(Boolean);
    return lines.join(" ");
}

/**
 * Evaluate one durable subject resolution for Commit Plan eligibility.
 */
export function evaluateSubjectEligibility(row: ProcessingResolutionRow): IdentityResolutionEligibility {
    const candidates = plausibleCandidates(row);
    const conflicted = hasUnresolvedConflicts(row);
    const action = row.decision_action;
    const by = row.decided_by ?? "engine";
    const override = readCreateNewOverride(row.provisional);
    const candidateRefs = candidates.map((c) => c.recordId);

    const base = {
        subjectRef: row.subject_ref,
        subjectRole: row.subject_role,
    };

    if (action === "request_information") {
        return {
            ...base,
            state: "unresolved",
            eligibleForPlan: false,
            blockingReasons: [
                {
                    code: "needs_information",
                    explanation: "Subject marked as needing more information — no create/link/update until resolved.",
                    evidenceRefs: [],
                    candidateRefs,
                },
            ],
            recommendationSummary: buildRecommendationSummary(row, "unresolved"),
        };
    }

    if (action === "review_required" || action == null || action === "") {
        const state: IdentityResolutionEligibilityState = conflicted ? "conflicted" : candidates.length ? "needs_review" : "unresolved";
        return {
            ...base,
            state,
            eligibleForPlan: false,
            blockingReasons: [
                {
                    code: conflicted ? "unresolved_conflict" : candidates.length ? "plausible_match_needs_review" : "undecided_subject",
                    explanation: conflicted
                        ? "Conflicting identity evidence must be resolved by the operator."
                        : candidates.length
                          ? "A plausible existing match exists — operator must accept, choose another, create new explicitly, or mark unresolved."
                          : "Subject has no confirmed identity decision.",
                    evidenceRefs: [],
                    candidateRefs,
                },
            ],
            recommendationSummary: buildRecommendationSummary(row, state),
        };
    }

    if (conflicted && by !== "operator") {
        return {
            ...base,
            state: "conflicted",
            eligibleForPlan: false,
            blockingReasons: [
                {
                    code: "engine_conflict_unresolved",
                    explanation: "Engine found conflicting identity evidence; an operator decision is required.",
                    evidenceRefs: [],
                    candidateRefs,
                },
            ],
            recommendationSummary: buildRecommendationSummary(row, "conflicted"),
        };
    }

    if (action === "create_new") {
        if (candidates.length === 0) {
            return {
                ...base,
                state: "confirmed_new",
                eligibleForPlan: true,
                blockingReasons: [],
                recommendationSummary: null,
            };
        }
        // Plausible match present: create is eligible only as an explicit operator override with reason.
        if (by === "operator" && override?.reason) {
            return {
                ...base,
                state: "confirmed_new",
                eligibleForPlan: true,
                blockingReasons: [],
                recommendationSummary: null,
            };
        }
        return {
            ...base,
            state: "needs_review",
            eligibleForPlan: false,
            blockingReasons: [
                {
                    code: "create_new_override_required",
                    explanation:
                        "A plausible existing match exists. Creating a new record requires an explicit operator create-new override with a reason.",
                    evidenceRefs: [],
                    candidateRefs,
                },
            ],
            recommendationSummary: buildRecommendationSummary(row, "needs_review"),
        };
    }

    if (action === "link_existing" || action === "update_existing") {
        if (!row.selected_candidate_id || row.selected_candidate_id === "none") {
            return {
                ...base,
                state: "needs_review",
                eligibleForPlan: false,
                blockingReasons: [
                    {
                        code: "missing_selected_candidate",
                        explanation: "Link/update requires an explicit selected existing record.",
                        evidenceRefs: [],
                        candidateRefs,
                    },
                ],
                recommendationSummary: buildRecommendationSummary(row, "needs_review"),
            };
        }
        if (by === "operator") {
            return {
                ...base,
                state: "confirmed_existing",
                eligibleForPlan: true,
                blockingReasons: [],
                recommendationSummary: null,
            };
        }
        const selected =
            candidates.find((c) => c.recordId === row.selected_candidate_id) ??
            (row.candidates ?? []).find((c) => c.recordId === row.selected_candidate_id);
        const trusted =
            selected &&
            (selected.confidenceBand === "confirmed" || selected.confidenceBand === "strong") &&
            !conflicted;
        if (trusted) {
            return {
                ...base,
                state: "confirmed_existing",
                eligibleForPlan: true,
                blockingReasons: [],
                recommendationSummary: null,
            };
        }
        return {
            ...base,
            state: "needs_review",
            eligibleForPlan: false,
            blockingReasons: [
                {
                    code: "ambiguous_auto_link",
                    explanation:
                        "Engine proposed linking a non-deterministic candidate. Operator must confirm the existing record.",
                    evidenceRefs: [],
                    candidateRefs,
                },
            ],
            recommendationSummary: buildRecommendationSummary(row, "needs_review"),
        };
    }

    if (action === "reject" || action === "escalate_duplicate" || action === "propose_merge") {
        return {
            ...base,
            state: "unresolved",
            eligibleForPlan: false,
            blockingReasons: [
                {
                    code: "non_executable_decision",
                    explanation: `Decision "${action}" does not produce executable identity create/link/update operations.`,
                    evidenceRefs: [],
                    candidateRefs,
                },
            ],
            recommendationSummary: buildRecommendationSummary(row, "unresolved"),
        };
    }

    return {
        ...base,
        state: "unresolved",
        eligibleForPlan: false,
        blockingReasons: [
            {
                code: "unknown_decision",
                explanation: `Unrecognized decision_action "${action}".`,
                evidenceRefs: [],
                candidateRefs,
            },
        ],
        recommendationSummary: null,
    };
}

/**
 * Case-level gate: every latest subject must be plan-eligible, and
 * lead/participation create is blocked while any child is unconfirmed.
 */
export function evaluateCasePlanEligibility(rows: ProcessingResolutionRow[]): CasePlanEligibility {
    const active = pickLatestResolutionPerSubject(rows);
    const subjects = active.map(evaluateSubjectEligibility);
    const blockers: IdentityBlockingReason[] = [];

    for (const s of subjects) {
        if (!s.eligibleForPlan) blockers.push(...s.blockingReasons.map((b) => ({ ...b, explanation: `${s.subjectRef}: ${b.explanation}` })));
    }

    const childSubjects = subjects.filter(
        (s) => s.subjectRole === "child" || s.subjectRef.startsWith("child:"),
    );
    const childUnconfirmed = childSubjects.some(
        (s) => s.state !== "confirmed_existing" && s.state !== "confirmed_new",
    );
    if (childUnconfirmed) {
        for (const lead of subjects.filter(
            (s) => s.subjectRole === "lead" || s.subjectRole === "participation" || s.subjectRef.includes("lead"),
        )) {
            if (lead.eligibleForPlan) {
                lead.eligibleForPlan = false;
                lead.state = lead.state === "confirmed_new" || lead.state === "confirmed_existing" ? "needs_review" : lead.state;
                lead.blockingReasons.push({
                    code: "child_identity_unconfirmed",
                    explanation: "Lead/process participation cannot finalize until every child identity is confirmed.",
                    evidenceRefs: [],
                });
                blockers.push({
                    code: "child_identity_unconfirmed",
                    explanation: `${lead.subjectRef}: Lead/process participation cannot finalize until every child identity is confirmed.`,
                    evidenceRefs: [],
                });
            }
        }
    }

    return {
        subjects,
        eligibleForPlan: subjects.length > 0 && subjects.every((s) => s.eligibleForPlan),
        blockers,
    };
}

/** Fail-closed assertion used by build / approve / execute paths. */
export function assertCaseEligibleForPlan(rows: ProcessingResolutionRow[]): CasePlanEligibility {
    const result = evaluateCasePlanEligibility(rows);
    if (!result.eligibleForPlan) {
        const detail = result.blockers.map((b) => `${b.code}: ${b.explanation}`).join(" | ") || "identity_subjects_ineligible";
        const err = new Error(detail);
        (err as Error & { code?: string }).code = "identity_review_required";
        throw err;
    }
    return result;
}

/**
 * Architectural boundary: adapters may not stamp ambiguous identities as
 * confirmed_new without an operator create-new override.
 */
export function adapterMayNotBypassEligibility(input: {
    decisionAction: string | null;
    decidedBy: string;
    candidates: IdentityCandidate[];
    provisional?: Record<string, unknown>;
}): { ok: boolean; reason?: string } {
    const row = {
        id: "boundary",
        org_id: "",
        case_id: "",
        generation_id: "",
        input_facts_hash: "",
        subject_ref: "boundary",
        subject_role: "child",
        provisional: input.provisional ?? {},
        candidates: input.candidates,
        decision_action: input.decisionAction,
        selected_candidate_id: null,
        decided_by: input.decidedBy,
        operator_id: null,
        policy_version: null,
        resolver_version: "boundary",
        stale_at: null,
        superseded_by: null,
        retention_class: "uncommitted_submission",
        created_at: "",
    } satisfies ProcessingResolutionRow;
    const eligibility = evaluateSubjectEligibility(row);
    if (input.decidedBy !== "operator" && input.decisionAction === "create_new" && input.candidates.some(isPlausibleCandidate)) {
        return { ok: false, reason: "adapter_cannot_auto_create_when_plausible_match_exists" };
    }
    if (!eligibility.eligibleForPlan && input.decisionAction === "create_new" && input.candidates.some(isPlausibleCandidate)) {
        return { ok: false, reason: eligibility.blockingReasons[0]?.code ?? "ineligible" };
    }
    return { ok: true };
}

/**
 * Commit Plan approval binding + validation (D1).
 *
 * Approval binds to exactly one (plan_id, plan_version, plan_content_hash). Any
 * material edit produces a new version + hash, which invalidates the prior
 * approval. Approval is a pure decision here; persistence lives in planDb.
 */

import { planHashMatches } from "./planHash";
import { planToOperationInputs, validatePlanInclusion } from "./planEditing";
import type { ApprovalAuthority, CommitPlan, PlanApproval } from "./planTypes";

export type ApprovalReadiness = {
    ready: boolean;
    blockers: string[];
};

/**
 * Determine whether a plan may be approved. Fails closed on tamper (hash
 * mismatch), supersession, unresolved blocking conflicts, or invalid inclusion.
 */
export function evaluateApprovalReadiness(
    plan: CommitPlan,
    opts: { blockingConflicts?: string[] } = {},
): ApprovalReadiness {
    const blockers: string[] = [];
    if (plan.supersededBy) blockers.push("plan_superseded");
    if (plan.status === "committed" || plan.status === "committing") blockers.push("plan_already_committing");
    if (!planHashMatches(plan)) blockers.push("plan_hash_mismatch");
    if ((opts.blockingConflicts ?? []).length > 0) blockers.push("unresolved_blocking_conflict");

    const inclusion = validatePlanInclusion(planToOperationInputs(plan));
    if (!inclusion.ok) blockers.push(...inclusion.issues.map((i) => i.code));

    if (!plan.operations.some((o) => o.included)) blockers.push("no_included_operations");

    return { ready: blockers.length === 0, blockers };
}

export type BindApprovalInput = {
    plan: CommitPlan;
    approvingActor: string;
    authority?: ApprovalAuthority;
    approvalId?: string;
    approvedAt?: string;
};

export function bindApproval(input: BindApprovalInput): PlanApproval {
    const { plan } = input;
    return {
        approvalId: input.approvalId ?? `${plan.planId}:approval`,
        orgId: plan.orgId,
        caseId: plan.caseId,
        planId: plan.planId,
        planVersion: plan.version,
        planContentHash: plan.contentHash,
        approvingActor: input.approvingActor,
        approvalAuthority: input.authority ?? (plan.requiresPrivilegedApproval ? "privileged" : "standard"),
        decision: "approved",
        includedOperationIds: plan.operations.filter((o) => o.included).map((o) => o.opId),
        approvedAt: input.approvedAt ?? new Date(0).toISOString(),
        invalidatedAt: null,
        invalidationReason: null,
    };
}

/** True when the approval still binds to the current plan (version + exact hash). */
export function approvalBindsToPlan(approval: PlanApproval, plan: CommitPlan): boolean {
    return (
        approval.decision === "approved" &&
        approval.invalidatedAt === null &&
        approval.planId === plan.planId &&
        approval.planVersion === plan.version &&
        approval.planContentHash === plan.contentHash &&
        !plan.supersededBy
    );
}

export type ApprovalValidation = { valid: boolean; reason: string | null };

/** Execution-preflight validation of a stored approval against the live plan. */
export function validateApprovalForExecution(
    approval: PlanApproval | null,
    plan: CommitPlan,
    opts: { actorAuthorized: boolean } = { actorAuthorized: true },
): ApprovalValidation {
    if (!approval) return { valid: false, reason: "no_approval" };
    if (approval.decision !== "approved") return { valid: false, reason: "approval_declined" };
    if (approval.invalidatedAt) return { valid: false, reason: "approval_invalidated" };
    if (plan.supersededBy) return { valid: false, reason: "plan_superseded" };
    if (approval.planVersion !== plan.version) return { valid: false, reason: "plan_version_mismatch" };
    if (approval.planContentHash !== plan.contentHash) return { valid: false, reason: "plan_hash_mismatch" };
    if (!planHashMatches(plan)) return { valid: false, reason: "plan_content_tampered" };
    if (!opts.actorAuthorized) return { valid: false, reason: "actor_not_authorized" };
    return { valid: true, reason: null };
}

/** Whether a stored approval is stale relative to the current plan hash. */
export function isApprovalStale(approval: PlanApproval, plan: CommitPlan): boolean {
    return approval.planContentHash !== plan.contentHash || Boolean(plan.supersededBy);
}

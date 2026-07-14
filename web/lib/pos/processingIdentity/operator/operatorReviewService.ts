/**
 * Operator Review Service (D3 §35) — the ONE canonical server-side application
 * service for the Processing identity review workflow. UI components and API
 * routes call this service; they never touch tables or individual commands
 * directly. It enforces org scope, actor permission, plan version/hash, approval,
 * executor preflight, and durable persistence + audit.
 *
 * Durable decisions live in B2 (facts/corrections), B3 (resolutions), D1
 * (plans/approvals), and D2 (attempts) — never transient UI/browser state.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import {
    appendCorrectedProcessingFact,
    listProcessingFactsByCase,
    type ProcessingFactRow,
} from "../processingFactsDb";
import {
    listProcessingResolutionsByCase,
    type ProcessingResolutionRow,
} from "../processingResolutionsDb";
import {
    bindApproval,
    buildCommitPlan,
    buildPlanDiffView,
    evaluateApprovalReadiness,
    insertApproval,
    insertCommitPlan,
    loadActiveApproval,
    loadCommitPlan,
    loadLatestPlanForCase,
    supersedePlan,
    type CommitPlan,
    type PlanApproval,
    type PlanDiffView,
} from "../plan";
import {
    executeApprovedPlan,
    insertCommitAttempt,
    insertException,
    loadLatestAttemptForPlan,
    type CommitAttempt,
    type ExecutorPorts,
} from "../executor";
import {
    projectIdentityReadiness,
    type IdentityReviewReadiness,
} from "./caseStateModel";
import {
    buildRecommendations,
    deriveResolutionSetFromResolutions,
    pickLatestResolutionPerSubject,
    type Escalation,
    type IdentityResolutionSet,
} from "./recommendationBuilder";
import {
    evaluateCasePlanEligibility,
    evaluateSubjectEligibility,
    plausibleCandidates,
    readCreateNewOverride,
    type IdentityResolutionEligibility,
} from "./identityResolutionEligibility";

export class OperatorServiceError extends Error {
    code: string;
    constructor(code: string, message: string) {
        super(message);
        this.code = code;
        this.name = "OperatorServiceError";
    }
}

export type OperatorReviewDeps = {
    supabase: SupabaseClient;
    orgId: string;
    actorId: string;
    /** Server-revalidated permission for approve/execute. */
    actorAuthorized: boolean;
    executorPorts: ExecutorPorts;
    now?: () => string;
};

export type CaseReviewState = {
    caseId: string;
    facts: ProcessingFactRow[];
    resolutions: ProcessingResolutionRow[];
    plan: CommitPlan | null;
    planDiff: PlanDiffView | null;
    approval: PlanApproval | null;
    latestAttempt: CommitAttempt | null;
    readiness: IdentityReviewReadiness;
    blockingConflictCount: number;
    subjectEligibility: IdentityResolutionEligibility[];
    planEligible: boolean;
    identityBlockers: string[];
};

function assertAuthorized(deps: OperatorReviewDeps): void {
    if (!deps.actorAuthorized) {
        throw new OperatorServiceError("actor_not_authorized", "Actor lacks permission for this action");
    }
}

function countBlockingConflicts(resolutions: ProcessingResolutionRow[]): number {
    let n = 0;
    for (const r of pickLatestResolutionPerSubject(resolutions)) {
        for (const c of r.candidates ?? []) {
            if ((c.blockingConflicts ?? []).length > 0 && !r.decision_action) n += 1;
            if (c.confidenceBand === "conflicted" && r.decision_action !== "link_existing" && r.decided_by !== "operator") {
                n += 1;
            }
        }
    }
    return n;
}

function requirePlanEligibility(rows: ProcessingResolutionRow[]): void {
    const eligibility = evaluateCasePlanEligibility(rows);
    if (!eligibility.eligibleForPlan) {
        throw new OperatorServiceError(
            "identity_review_required",
            eligibility.blockers.map((b) => `${b.code}: ${b.explanation}`).join(" | ") ||
                "Identity subjects are not eligible for plan finalization",
        );
    }
}

// ---------------------------------------------------------------------------
// Load
// ---------------------------------------------------------------------------
export async function loadCaseReview(
    deps: OperatorReviewDeps,
    caseId: string,
): Promise<CaseReviewState> {
    const [facts, resolutions, plan] = await Promise.all([
        listProcessingFactsByCase(deps.supabase, deps.orgId, caseId),
        listProcessingResolutionsByCase(deps.supabase, deps.orgId, caseId),
        loadLatestPlanForCase(deps.supabase, { orgId: deps.orgId, caseId }),
    ]);

    let approval: PlanApproval | null = null;
    let latestAttempt: CommitAttempt | null = null;
    if (plan) {
        approval = await loadActiveApproval(deps.supabase, { orgId: deps.orgId, planId: plan.planId });
        latestAttempt = await loadLatestAttemptForPlan(deps.supabase, { orgId: deps.orgId, planId: plan.planId });
    }

    const { count: openExceptionCount } = await deps.supabase
        .from("processing_exceptions")
        .select("id", { count: "exact", head: true })
        .eq("org_id", deps.orgId)
        .eq("case_id", caseId);

    const blockingConflictCount = countBlockingConflicts(resolutions);
    const caseEligibility = evaluateCasePlanEligibility(resolutions);
    const active = pickLatestResolutionPerSubject(resolutions);
    const undecided = active.filter((r) => {
        const el = evaluateSubjectEligibility(r);
        return !el.eligibleForPlan;
    }).length;
    const needsInformation = active.some((r) => r.decision_action === "request_information");
    const readiness = projectIdentityReadiness({
        hasFacts: facts.length > 0,
        resolutionCount: active.length,
        undecidedResolutionCount: undecided,
        blockingConflictCount,
        ineligibleSubjectCount: caseEligibility.subjects.filter((s) => !s.eligibleForPlan).length,
        needsInformation,
        plan: plan ? { exists: true, supersededOrStale: Boolean(plan.supersededBy) } : null,
        hasValidApproval: Boolean(approval),
        latestAttemptOutcome:
            latestAttempt?.outcome === "preflight_rejected" ? "failed" : latestAttempt?.outcome ?? null,
        hasOpenException: (openExceptionCount ?? 0) > 0,
    });

    return {
        caseId,
        facts,
        resolutions,
        plan,
        planDiff: plan ? buildPlanDiffView(plan) : null,
        approval,
        latestAttempt,
        readiness,
        blockingConflictCount,
        subjectEligibility: caseEligibility.subjects,
        planEligible: caseEligibility.eligibleForPlan,
        identityBlockers: caseEligibility.blockers.map((b) => `${b.code}: ${b.explanation}`),
    };
}

// ---------------------------------------------------------------------------
// Corrections (append a new fact version — never overwrite)
// ---------------------------------------------------------------------------
export async function recordCorrection(
    deps: OperatorReviewDeps,
    input: { originalFactId: string; correctedNormalizedValue: string; caseId: string },
): Promise<ProcessingFactRow> {
    const facts = await listProcessingFactsByCase(deps.supabase, deps.orgId, input.caseId);
    const original = facts.find((f) => f.id === input.originalFactId);
    if (!original) throw new OperatorServiceError("fact_not_found", "Original fact not found in this case");
    return appendCorrectedProcessingFact(deps.supabase, {
        original,
        correctedNormalizedValue: input.correctedNormalizedValue,
        operatorId: deps.actorId,
    });
}

// ---------------------------------------------------------------------------
// Resolution decisions (mutable until a plan is built)
// ---------------------------------------------------------------------------
export async function recordResolutionDecision(
    deps: OperatorReviewDeps,
    input: {
        resolutionId: string;
        caseId: string;
        decisionAction: string;
        selectedCandidateId?: string | null;
        /** Required when creating new despite plausible matches. */
        createNewOverrideReason?: string | null;
        createNewOverrideReasonCode?: string | null;
    },
): Promise<void> {
    const rows = await listProcessingResolutionsByCase(deps.supabase, deps.orgId, input.caseId);
    const existing = rows.find((r) => r.id === input.resolutionId);
    if (!existing) throw new OperatorServiceError("resolution_not_found", "Resolution not found in this case/org");

    const candidates = plausibleCandidates(existing);
    let provisional = { ...(existing.provisional ?? {}) };

    if (input.decisionAction === "create_new" && candidates.length > 0) {
        const reason = (input.createNewOverrideReason ?? "").trim();
        if (!reason) {
            throw new OperatorServiceError(
                "create_new_override_required",
                "Creating a new record despite a plausible existing match requires an explicit operator reason",
            );
        }
        provisional = {
            ...provisional,
            create_new_override: {
                reason,
                reasonCode: input.createNewOverrideReasonCode ?? "operator_create_new_override",
                rejectedCandidateIds: candidates.map((c) => c.recordId),
                decidedAt: deps.now?.() ?? new Date().toISOString(),
                operatorId: deps.actorId,
            },
            rejected_candidates: candidates,
            recommended_action_at_decision: existing.decision_action,
        };
    } else if (input.decisionAction !== "create_new" && provisional.create_new_override) {
        const { create_new_override: _removed, ...rest } = provisional;
        provisional = rest;
    }

    // Preserve rejected-candidate audit when linking after review.
    if (input.decisionAction === "link_existing" && candidates.length > 0) {
        provisional = {
            ...provisional,
            operator_selected_candidate_id: input.selectedCandidateId ?? null,
            candidates_shown_at_decision: candidates,
        };
    }

    const { data, error } = await deps.supabase
        .from("processing_resolutions")
        .update({
            decision_action: input.decisionAction,
            selected_candidate_id: input.selectedCandidateId ?? null,
            decided_by: "operator",
            operator_id: deps.actorId,
            provisional,
        })
        .eq("org_id", deps.orgId)
        .eq("case_id", input.caseId)
        .eq("id", input.resolutionId)
        .select("id");
    if (error) throw new OperatorServiceError("resolution_update_failed", error.message);
    if (!data || (Array.isArray(data) && data.length === 0)) {
        throw new OperatorServiceError("resolution_not_found", "Resolution not found in this case/org");
    }
}

// ---------------------------------------------------------------------------
// Build / revise a plan from operator resolution decisions
// ---------------------------------------------------------------------------
export async function buildPlan(
    deps: OperatorReviewDeps,
    input: {
        caseId: string;
        /** Explicit operator-authored set; when omitted, derived from durable resolutions. */
        resolutionSet?: IdentityResolutionSet;
        sourceResolutionVersions?: string[];
    },
): Promise<{ plan: CommitPlan; escalations: Escalation[]; requestInformation: boolean }> {
    const rows = await listProcessingResolutionsByCase(deps.supabase, deps.orgId, input.caseId);
    requirePlanEligibility(rows);

    let resolutionSet = input.resolutionSet;
    let sourceResolutionVersions = input.sourceResolutionVersions;
    if (!resolutionSet) {
        const active = pickLatestResolutionPerSubject(rows);
        const rejected = active.filter((r) => r.decision_action === "reject");
        if (rejected.length > 0) {
            throw new OperatorServiceError(
                "resolution_rejected",
                `Cannot build commit plan while ${rejected.length} subject(s) are rejected`,
            );
        }
        resolutionSet = deriveResolutionSetFromResolutions(rows);
        // Bind the plan to the resolution generations it was built from.
        sourceResolutionVersions =
            sourceResolutionVersions ?? Array.from(new Set(rows.map((r) => r.generation_id)));
    }
    const recs = buildRecommendations(resolutionSet);
    if (recs.operations.length === 0) {
        throw new OperatorServiceError(
            "no_executable_operations",
            "Resolution decisions produced no executable operations (escalation/request-info only)",
        );
    }

    const previous = await loadLatestPlanForCase(deps.supabase, { orgId: deps.orgId, caseId: input.caseId });
    const version = previous ? previous.version + 1 : 1;
    const draft = buildCommitPlan({
        orgId: deps.orgId,
        caseId: input.caseId,
        version,
        operations: recs.operations,
        sourceResolutionVersions,
        builtAt: deps.now?.(),
    });
    const persisted = await insertCommitPlan(deps.supabase, draft);

    // A new version supersedes the prior and voids its approval (Decision F).
    if (previous) {
        await supersedePlan(deps.supabase, {
            orgId: deps.orgId,
            previousPlanId: previous.planId,
            newPlanId: persisted.planId,
        });
    }

    return { plan: persisted, escalations: recs.escalations, requestInformation: recs.requestInformation };
}

// ---------------------------------------------------------------------------
// Approve (binds to exact version + hash)
// ---------------------------------------------------------------------------
export async function approvePlan(
    deps: OperatorReviewDeps,
    input: { caseId: string; planId: string; blockingConflicts?: string[] },
): Promise<PlanApproval> {
    assertAuthorized(deps);
    const rows = await listProcessingResolutionsByCase(deps.supabase, deps.orgId, input.caseId);
    requirePlanEligibility(rows);

    const plan = await loadCommitPlan(deps.supabase, { orgId: deps.orgId, planId: input.planId });
    if (!plan) throw new OperatorServiceError("plan_not_found", "Plan not found in this org");
    if (plan.caseId !== input.caseId) throw new OperatorServiceError("plan_case_mismatch", "Plan does not belong to this case");

    const readiness = evaluateApprovalReadiness(plan, { blockingConflicts: input.blockingConflicts });
    if (!readiness.ready) {
        throw new OperatorServiceError("not_ready_for_approval", readiness.blockers.join(","));
    }
    const approval = bindApproval({ plan, approvingActor: deps.actorId, approvedAt: deps.now?.() });
    await insertApproval(deps.supabase, approval);
    return approval;
}

// ---------------------------------------------------------------------------
// Execute (explicit operator action; requires a valid approval)
// ---------------------------------------------------------------------------
export async function executeApprovedPlanForCase(
    deps: OperatorReviewDeps,
    input: { caseId: string; planId: string; executionIdempotencyKey: string; currentRecordVersions?: Record<string, string> },
): Promise<CommitAttempt> {
    assertAuthorized(deps);
    const rows = await listProcessingResolutionsByCase(deps.supabase, deps.orgId, input.caseId);
    requirePlanEligibility(rows);

    const plan = await loadCommitPlan(deps.supabase, { orgId: deps.orgId, planId: input.planId });
    if (!plan) throw new OperatorServiceError("plan_not_found", "Plan not found in this org");
    if (plan.caseId !== input.caseId) throw new OperatorServiceError("plan_case_mismatch", "Plan does not belong to this case");

    const approval = await loadActiveApproval(deps.supabase, { orgId: deps.orgId, planId: plan.planId });
    const priorAttempt = await loadLatestAttemptForPlan(deps.supabase, { orgId: deps.orgId, planId: plan.planId });

    const attempt = await executeApprovedPlan(
        {
            plan,
            approval,
            context: { orgId: deps.orgId, actorId: deps.actorId, actorAuthorized: deps.actorAuthorized },
            executionIdempotencyKey: input.executionIdempotencyKey,
            currentRecordVersions: input.currentRecordVersions,
            priorAttempt,
            now: deps.now,
        },
        deps.executorPorts,
    );

    // Persist the attempt (append-only) unless it is an idempotent replay of a prior committed attempt.
    if (!(priorAttempt && attempt.attemptId === priorAttempt.attemptId)) {
        await insertCommitAttempt(deps.supabase, attempt);
    }

    if (attempt.outcome === "preflight_rejected" || attempt.outcome === "failed") {
        await insertException(deps.supabase, {
            orgId: deps.orgId,
            caseId: input.caseId,
            exceptionType: attempt.outcome === "preflight_rejected" ? "stale_plan" : "partial_commit",
            severity: "blocker",
            code: attempt.preflightFailures[0] ?? "execution_failed",
            message: attempt.preflightFailures.join(",") || "commit execution failed",
        });
    } else if (attempt.outcome === "partially_committed") {
        await insertException(deps.supabase, {
            orgId: deps.orgId,
            caseId: input.caseId,
            exceptionType: "partial_commit",
            severity: "warning",
            code: "partial_commit",
            message: attempt.operations.filter((o) => o.status === "failed" || o.status === "async_failed").map((o) => `${o.opId}:${o.error}`).join(","),
        });
    }

    return attempt;
}

export async function readAttempts(
    deps: OperatorReviewDeps,
    input: { planId: string },
): Promise<CommitAttempt | null> {
    return loadLatestAttemptForPlan(deps.supabase, { orgId: deps.orgId, planId: input.planId });
}

/** Test/helper export: inspect override lineage on a resolution. */
export function getCreateNewOverrideAudit(row: ProcessingResolutionRow) {
    return readCreateNewOverride(row.provisional);
}

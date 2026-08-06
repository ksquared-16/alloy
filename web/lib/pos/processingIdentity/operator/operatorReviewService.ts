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
import { applyCreateLeadPostCommitPersistence } from "./applyCreateLeadPostCommitPersistence";
import { TRUST_GOVERNANCE_GAP_EXCEPTION_TYPES } from "@/lib/pos/trustGovernance/gapExceptionTypes";
import {
    supersedeForOperatorDecision,
    type IdentityLineageDeps,
    type IdentityLineageOutcome,
} from "../trustAdapter/identityLineageService";
import {
    bindCommitOutcomeToTrust,
    type ExecutionLineageDeps,
} from "../trustAdapter/executionLineageService";

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
    /**
     * Trust supersession lineage (Phase 1.6). Defaults ON in production.
     * `false` suppresses it entirely — the control arm proving the operator
     * decision behaves identically with and without Trust. An object injects
     * certification seams.
     */
    trustLineage?: false | IdentityLineageDeps;
    /**
     * Trust execution binding (Phase 1.7). Defaults ON in production.
     * `false` suppresses it entirely — the control arm proving plan generation,
     * approval, preflight and execution are byte-identical with and without
     * Trust. An object injects certification seams.
     */
    trustExecution?: false | ExecutionLineageDeps;
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

    // A Trust governance gap is NOT an identity exception. It records that a
    // Decision Package could not be captured; the Processing work committed and
    // is authoritative, and nothing about identity review changed. Counting one
    // here would flip the review lane to `exception` purely because Trust was
    // unavailable — exactly the coupling AD-P1-8 forbids.
    //
    // Excluded by SHARED LIST, so a new capability's gap type is isolated here
    // the moment it is registered rather than the next time someone remembers.
    const openExceptionQuery = TRUST_GOVERNANCE_GAP_EXCEPTION_TYPES.reduce(
        (query, gapType) => query.neq("exception_type", gapType),
        deps.supabase
            .from("processing_exceptions")
            .select("id", { count: "exact", head: true })
            .eq("org_id", deps.orgId)
            .eq("case_id", caseId),
    );
    const { count: openExceptionCount } = await openExceptionQuery;

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
): Promise<{ trustLineage: IdentityLineageOutcome | null }> {
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

    // ---- Trust adoption Phase 1.6 -------------------------------------------
    // The operator decision is now DURABLE and authoritative. Only here may the
    // prior engine judgment be declared non-current — and the decision itself
    // never becomes a Decision Package, because a human decision is a Processing
    // act, not deterministic reasoning.
    //
    // Additive and non-blocking by construction: it never throws, it cannot
    // change a resolution row, and a Trust outage produces a durable,
    // readiness-neutral lineage gap rather than failing this correction.
    let trustLineage: IdentityLineageOutcome | null = null;
    if (deps.trustLineage !== false) {
        trustLineage = await supersedeForOperatorDecision(deps.supabase, {
            orgId: deps.orgId,
            caseId: input.caseId,
            resolutionId: input.resolutionId,
            // Authoritative server context, never the request body.
            actorId: deps.actorId,
            deps: typeof deps.trustLineage === "object" ? deps.trustLineage : undefined,
        });
    }
    return { trustLineage };
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
    // Thread intake-resolved work_unit_id + location_id (stored on create_lead_intake) onto the
    // lead subject so createLead persists them. Without work_unit_id, Work Unit membership excludes
    // the row; without location_id, queue/focus location chips stay empty despite required intake.
    {
        const leadSubject = resolutionSet.subjects.find((s) => s.role === "lead");
        const needsWorkUnit =
            leadSubject && !(typeof leadSubject.values?.work_unit_id === "string" && leadSubject.values.work_unit_id);
        const needsLocation =
            leadSubject && !(typeof leadSubject.values?.location_id === "string" && leadSubject.values.location_id);
        if (leadSubject && (needsWorkUnit || needsLocation)) {
            const { data: caseRow } = await deps.supabase
                .from("processing_cases")
                .select("metadata")
                .eq("org_id", deps.orgId)
                .eq("id", input.caseId)
                .maybeSingle();
            const intake = (caseRow as {
                metadata?: {
                    create_lead_intake?: { work_unit_id?: unknown; location_id?: unknown };
                };
            } | null)?.metadata?.create_lead_intake;
            const workUnitId =
                typeof intake?.work_unit_id === "string" && intake.work_unit_id.trim()
                    ? intake.work_unit_id.trim()
                    : null;
            const locationId =
                typeof intake?.location_id === "string" && intake.location_id.trim()
                    ? intake.location_id.trim()
                    : null;
            if ((needsWorkUnit && workUnitId) || (needsLocation && locationId)) {
                resolutionSet = {
                    subjects: resolutionSet.subjects.map((s) => {
                        if (s.role !== "lead") return s;
                        return {
                            ...s,
                            values: {
                                ...(s.values ?? {}),
                                ...(needsWorkUnit && workUnitId ? { work_unit_id: workUnitId } : {}),
                                ...(needsLocation && locationId ? { location_id: locationId } : {}),
                            },
                        };
                    }),
                };
            }
        }
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
    //
    // `insertCommitAttempt` returns the DURABLE row id, which was previously
    // discarded. It is captured now because it is the only identifier that
    // PROVES the result persisted: a replayed attempt was loaded from the
    // database and already carries the row id in `attemptId`, while a freshly
    // executed one carries the synthetic `${planId}:attempt:${n}` until the
    // insert returns.
    let commitAttemptId: string | null = null;
    if (!(priorAttempt && attempt.attemptId === priorAttempt.attemptId)) {
        commitAttemptId = await insertCommitAttempt(deps.supabase, attempt);
    } else {
        commitAttemptId = priorAttempt.attemptId;
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

    if (attempt.outcome === "committed" || attempt.outcome === "partially_committed") {
        await applyCreateLeadPostCommitPersistence(deps.supabase, {
            orgId: deps.orgId,
            caseId: input.caseId,
            attempt,
        });
    }

    // ---- Trust adoption Phase 1.7 -------------------------------------------
    // The commit result is now DURABLE. Only here may the real-world outcome of
    // a governed judgment be observed — and only downstream: this records what
    // the Processing executor DID. Nothing here can execute, approve or alter a
    // plan, and Trust never initiates.
    //
    // Additive and non-blocking by construction: it never throws, it cannot
    // change a Processing row, and a Trust outage produces durable,
    // readiness-neutral per-package gaps rather than failing this execution.
    if (deps.trustExecution !== false && commitAttemptId) {
        await bindCommitOutcomeToTrust(deps.supabase, {
            orgId: deps.orgId,
            plan,
            attempt,
            commitAttemptId,
            actorId: deps.actorId,
            deps: typeof deps.trustExecution === "object" ? deps.trustExecution : undefined,
        });
    }

    return attempt;
}

// ---------------------------------------------------------------------------
// Compose the full lead commit: build → approve → execute in one operator action
// ---------------------------------------------------------------------------
/**
 * Runs the complete identity commit for a case that is ready for it: builds the
 * commit plan from durable resolutions, approves it, and executes it — producing
 * the full record set (household + child + person + link + lead +
 * create_process_participation), not just a person.
 *
 * This is the composition behind the Decision Conversation "Approve" for a
 * form_submission lead case: rather than the minimal person-only handoff, one
 * operator approval commits the whole lead → enrollment participation.
 *
 * All three underlying service calls independently enforce the review gates, so
 * this composition inherits them for free — in particular {@link requirePlanEligibility}
 * throws `identity_review_required` when a subject has a plausible existing match
 * that the operator has not explicitly resolved. That means an existing-household
 * submission does NOT auto-commit here; it surfaces for review (the operator uses
 * the identity review panel to accept/choose/override), preserving duplicate
 * prevention. The deterministic `exec:${planId}:${contentHash}` idempotency key
 * makes a retried approval a safe replay rather than a double commit.
 */
export async function commitApprovedLeadForCase(
    deps: OperatorReviewDeps,
    input: { caseId: string },
): Promise<{ plan: CommitPlan; approval: PlanApproval; attempt: CommitAttempt }> {
    const { plan } = await buildPlan(deps, { caseId: input.caseId });
    const approval = await approvePlan(deps, { caseId: input.caseId, planId: plan.planId });
    const attempt = await executeApprovedPlanForCase(deps, {
        caseId: input.caseId,
        planId: plan.planId,
        executionIdempotencyKey: `exec:${plan.planId}:${plan.contentHash}`,
    });
    return { plan, approval, attempt };
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

import type { SupabaseClient } from "@supabase/supabase-js";
import { createExecutorPorts } from "@/lib/pos/processingIdentity/executor/executorPorts";
import {
    approvePlan,
    buildPlan,
    executeApprovedPlanForCase,
    loadCaseReview,
    recordResolutionDecision,
    type OperatorReviewDeps,
} from "@/lib/pos/processingIdentity/operator/operatorReviewService";
import { listProcessingResolutionsByCase } from "@/lib/pos/processingIdentity/processingResolutionsDb";
import { pickLatestResolutionPerSubject } from "@/lib/pos/processingIdentity/operator/recommendationBuilder";
import type { CommitAttempt } from "@/lib/pos/processingIdentity/executor";

export function makeOperatorDeps(
    supabase: SupabaseClient,
    orgId: string,
    actorId: string,
): OperatorReviewDeps {
    return {
        supabase,
        orgId,
        actorId,
        actorAuthorized: true,
        executorPorts: createExecutorPorts(supabase),
    };
}

/** Resolve undecided resolutions to create_new or link_existing, then approve + execute. */
export async function approveAndExecuteAllCreateNew(
    deps: OperatorReviewDeps,
    caseId: string,
    idempotencyKey: string,
): Promise<CommitAttempt> {
    await resolveUndecidedResolutions(deps, caseId);
    const { plan } = await buildPlan(deps, { caseId });
    await approvePlan(deps, { caseId, planId: plan.planId });
    return executeApprovedPlanForCase(deps, {
        caseId,
        planId: plan.planId,
        executionIdempotencyKey: idempotencyKey,
    });
}

export async function resolveUndecidedResolutions(deps: OperatorReviewDeps, caseId: string): Promise<void> {
    const resolutions = pickLatestResolutionPerSubject(
        await listProcessingResolutionsByCase(deps.supabase, deps.orgId, caseId),
    );
    for (const r of resolutions) {
        const plausible = (r.candidates ?? []).filter(
            (c) => c.recordId && c.recordId !== "none" && c.recordId !== "ambiguous",
        );
        const conflicted =
            r.decision_action === "reject" ||
            (r.candidates ?? []).some(
                (c) => c.confidenceBand === "conflicted" || (c.blockingConflicts?.length ?? 0) > 0,
            );
        // Cert harness never silently clears identity conflicts — operator (or a dedicated
        // scenario) must resolve them. Product gate remains: conflicted ≠ auto-commit.
        if (conflicted && r.decided_by !== "operator") continue;

        const engineCreateWithMatch =
            r.decision_action === "create_new" && r.decided_by !== "operator" && plausible.length > 0;
        const engineAmbiguousLink =
            (r.decision_action === "link_existing" || r.decision_action === "update_existing") &&
            r.decided_by !== "operator" &&
            plausible.some((c) => c.confidenceBand === "possible" || c.confidenceBand === "weak");
        const undecided =
            !r.decision_action ||
            r.decision_action === "review_required" ||
            engineCreateWithMatch ||
            engineAmbiguousLink;

        if (!undecided) continue;

        const trustedSelected =
            r.selected_candidate_id &&
            r.selected_candidate_id !== "none" &&
            r.selected_candidate_id !== "ambiguous";
        const action = trustedSelected ? "link_existing" : "create_new";
        await recordResolutionDecision(deps, {
            resolutionId: r.id,
            caseId,
            decisionAction: action,
            selectedCandidateId: trustedSelected ? r.selected_candidate_id : null,
            createNewOverrideReason:
                action === "create_new" && plausible.length > 0
                    ? "certification_harness_create_new_override"
                    : null,
            createNewOverrideReasonCode:
                action === "create_new" && plausible.length > 0 ? "cert_harness_override" : null,
        });
    }
}

export async function approveWithoutExecute(deps: OperatorReviewDeps, caseId: string) {
    await resolveUndecidedResolutions(deps, caseId);
    const { plan } = await buildPlan(deps, { caseId });
    await approvePlan(deps, { caseId, planId: plan.planId });
    return plan;
}

export async function countOrgIdentityRecords(
    supabase: SupabaseClient,
    orgId: string,
): Promise<{ persons: number; customers: number; members: number; opportunities: number; processInstances: number }> {
    const [p, c, m, o, pi] = await Promise.all([
        supabase.from("persons").select("id", { count: "exact", head: true }).eq("org_id", orgId),
        supabase.from("customers").select("id", { count: "exact", head: true }).eq("org_id", orgId),
        supabase.from("customer_members").select("id", { count: "exact", head: true }).eq("org_id", orgId),
        supabase.from("opportunities").select("id", { count: "exact", head: true }).eq("org_id", orgId),
        supabase.from("process_instances").select("id", { count: "exact", head: true }).eq("org_id", orgId),
    ]);
    return {
        persons: p.count ?? 0,
        customers: c.count ?? 0,
        members: m.count ?? 0,
        opportunities: o.count ?? 0,
        processInstances: pi.count ?? 0,
    };
}

export async function countCommitAttempts(
    supabase: SupabaseClient,
    orgId: string,
    caseId: string,
): Promise<number> {
    const { count } = await supabase
        .from("processing_commit_attempts")
        .select("id", { count: "exact", head: true })
        .eq("org_id", orgId)
        .eq("case_id", caseId);
    return count ?? 0;
}

export async function loadCaseMetadata(
    supabase: SupabaseClient,
    orgId: string,
    caseId: string,
): Promise<Record<string, unknown>> {
    const { data } = await supabase
        .from("processing_cases")
        .select("metadata, status")
        .eq("org_id", orgId)
        .eq("id", caseId)
        .maybeSingle();
    return ((data as { metadata?: Record<string, unknown> } | null)?.metadata ?? {});
}

export async function listCaseExceptions(
    supabase: SupabaseClient,
    orgId: string,
    caseId: string,
): Promise<{ exception_type: string; code: string }[]> {
    const { data } = await supabase
        .from("processing_exceptions")
        .select("exception_type, code")
        .eq("org_id", orgId)
        .eq("case_id", caseId);
    return (data ?? []) as { exception_type: string; code: string }[];
}

/** Invoke real D2 RPC directly for atomicity certification. */
export async function invokeAtomicGroup(
    supabase: SupabaseClient,
    args: {
        orgId: string;
        actorId: string;
        idempotencyKey: string;
        operations: { op_id: string; command_key: string; payload: Record<string, unknown> }[];
    },
): Promise<{ ok: boolean; refs?: Record<string, string>; error?: string }> {
    const { data, error } = await supabase.rpc("execute_processing_identity_group", {
        p_org_id: args.orgId,
        p_actor: args.actorId,
        p_idempotency_key: args.idempotencyKey,
        p_operations: args.operations,
    });
    if (error) return { ok: false, error: error.message };
    const payload = (data ?? {}) as { ok?: boolean; refs?: Record<string, string>; error?: string };
    return { ok: Boolean(payload.ok), refs: payload.refs, error: payload.error };
}

import type { SupabaseClient } from "@supabase/supabase-js";
import { createExecutorPorts } from "@/lib/pos/processingIdentity/executor/executorPorts";
import {
    approvePlan,
    buildPlan,
    executeApprovedPlanForCase,
    recordResolutionDecision,
    type OperatorReviewDeps,
} from "@/lib/pos/processingIdentity/operator/operatorReviewService";
import { listProcessingResolutionsByCase } from "@/lib/pos/processingIdentity/processingResolutionsDb";
import { pickLatestResolutionPerSubject } from "@/lib/pos/processingIdentity/operator/recommendationBuilder";

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
) {
    const resolutions = pickLatestResolutionPerSubject(
        await listProcessingResolutionsByCase(deps.supabase, deps.orgId, caseId),
    );
    for (const r of resolutions) {
        if (r.decision_action && r.decision_action !== "review_required") continue;
        const action = r.selected_candidate_id ? "link_existing" : "create_new";
        await recordResolutionDecision(deps, {
            resolutionId: r.id,
            caseId,
            decisionAction: action,
            selectedCandidateId: r.selected_candidate_id,
        });
    }
    const { plan } = await buildPlan(deps, { caseId });
    await approvePlan(deps, { caseId, planId: plan.planId });
    return executeApprovedPlanForCase(deps, {
        caseId,
        planId: plan.planId,
        executionIdempotencyKey: idempotencyKey,
    });
}

export async function countOrgIdentityRecords(
    supabase: SupabaseClient,
    orgId: string,
): Promise<{ persons: number; customers: number; members: number; opportunities: number }> {
    const [p, c, m, o] = await Promise.all([
        supabase.from("persons").select("id", { count: "exact", head: true }).eq("org_id", orgId),
        supabase.from("customers").select("id", { count: "exact", head: true }).eq("org_id", orgId),
        supabase.from("customer_members").select("id", { count: "exact", head: true }).eq("org_id", orgId),
        supabase.from("opportunities").select("id", { count: "exact", head: true }).eq("org_id", orgId),
    ]);
    return {
        persons: p.count ?? 0,
        customers: c.count ?? 0,
        members: m.count ?? 0,
        opportunities: o.count ?? 0,
    };
}

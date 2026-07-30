/**
 * Child Waitlist progression via the Outcome Runtime (status + stage + work reconciliation).
 *
 * `waitlist_child` converges here so operators do not get a second writer that only
 * patches OCM.outcome_status_key while stage/work remain elsewhere.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import {
    applyStageOutcomeRuleTarget,
    type StageOutcomeExecutionSubject,
} from "@/lib/lifecycle/stageOutcomeRuleTargetExecutor";
import type { StageOperatingPlanV1 } from "@/lib/lifecycle/stageOperatingPlanV1";

export const CHILD_WAITLIST_DISPOSITION_KEY = "waitlisted" as const;
export const CHILD_WAITLIST_STAGE_KEY = "waitlist" as const;

export type ApplyChildWaitlistViaOutcomeRuntimeResult =
    | {
          ok: true;
          opportunity_id: string;
          customer_member_id: string;
          degraded?: string;
      }
    | { ok: false; error: string };

function trimOrNull(v: unknown): string | null {
    if (typeof v !== "string") return null;
    const s = v.trim();
    return s || null;
}

/** Resolve opportunity + customer_member from an OCM subject id (command subject). */
export async function resolveChildWaitlistSubjectFromOcm(params: {
    supabase: SupabaseClient;
    orgId: string;
    opportunityCustomerMemberId: string;
}): Promise<
    | {
          opportunity_id: string;
          customer_member_id: string;
          opportunity_customer_member_id: string;
      }
    | { error: string }
> {
    const ocmId = params.opportunityCustomerMemberId.trim();
    if (!ocmId) return { error: "Child enrollment subject required" };

    const { data, error } = await params.supabase
        .from("opportunity_customer_members")
        .select("id, opportunity_id, customer_member_id")
        .eq("id", ocmId)
        .eq("org_id", params.orgId)
        .maybeSingle();

    if (error) return { error: error.message };
    const opportunityId = trimOrNull((data as { opportunity_id?: string } | null)?.opportunity_id);
    const customerMemberId = trimOrNull((data as { customer_member_id?: string } | null)?.customer_member_id);
    if (!opportunityId || !customerMemberId) {
        return { error: "Could not resolve child subject for waitlist progression" };
    }
    return {
        opportunity_id: opportunityId,
        customer_member_id: customerMemberId,
        opportunity_customer_member_id: ocmId,
    };
}

/**
 * Apply the canonical Waitlist outcome targets for one child:
 *   1. update_child_enrollment_status → waitlisted (process_instances + placement)
 *   2. move_to_stage → waitlist (stage membership + work reconciliation)
 *
 * Never falls back to family/case grain. Sibling process instances are untouched.
 */
export async function applyChildWaitlistViaOutcomeRuntime(params: {
    supabase: SupabaseClient;
    orgId: string;
    userId: string;
    departmentId: string;
    opportunityId: string;
    customerMemberId: string;
    opportunityCustomerMemberId?: string | null;
    /** Optional plan stub — executor only reads stage_key for some paths; move uses inventory. */
    plan?: StageOperatingPlanV1 | null;
    sourceStageKey?: string | null;
}): Promise<ApplyChildWaitlistViaOutcomeRuntimeResult> {
    const customerMemberId = params.customerMemberId.trim();
    const opportunityId = params.opportunityId.trim();
    if (!customerMemberId || !opportunityId) {
        return { ok: false, error: "Child Waitlist requires opportunity and customer_member_id" };
    }

    const subject: StageOutcomeExecutionSubject = {
        journey_segment: "child",
        opportunity_id: opportunityId,
        customer_member_id: customerMemberId,
        ...(trimOrNull(params.opportunityCustomerMemberId)
            ? { opportunity_customer_member_id: trimOrNull(params.opportunityCustomerMemberId) }
            : {}),
    };

    const plan = (params.plan ?? {
        version: 1,
        lifecycle_key: "enrollment",
        stage_key: params.sourceStageKey?.trim() || "decision_pending",
        journey_segment: "child",
        work_templates: [],
        outcomes: [],
        outcome_rules: [],
    }) as StageOperatingPlanV1;

    const statusResult = await applyStageOutcomeRuleTarget(params.supabase, {
        orgId: params.orgId,
        userId: params.userId,
        departmentId: params.departmentId,
        stageKey: plan.stage_key,
        plan,
        subject,
        target: {
            kind: "update_child_enrollment_status",
            disposition_key: CHILD_WAITLIST_DISPOSITION_KEY,
        },
    });
    if (statusResult.error) {
        return { ok: false, error: statusResult.error };
    }

    const moveResult = await applyStageOutcomeRuleTarget(params.supabase, {
        orgId: params.orgId,
        userId: params.userId,
        departmentId: params.departmentId,
        stageKey: plan.stage_key,
        plan,
        subject,
        target: {
            kind: "move_to_stage",
            stage_key: CHILD_WAITLIST_STAGE_KEY,
        },
    });
    if (moveResult.error) {
        // Compensate status if stage move fails — keep progression atomic from the operator's view.
        if (statusResult.undo) {
            try {
                await statusResult.undo();
            } catch (e) {
                return {
                    ok: false,
                    error: `Waitlist stage move failed (${moveResult.error}); status rollback also failed: ${
                        e instanceof Error ? e.message : String(e)
                    }`,
                };
            }
        }
        return { ok: false, error: moveResult.error };
    }

    const degraded = [statusResult.degraded, moveResult.degraded].filter(Boolean).join("; ") || undefined;
    return {
        ok: true,
        opportunity_id: opportunityId,
        customer_member_id: customerMemberId,
        degraded,
    };
}

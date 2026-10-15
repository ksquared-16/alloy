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
import { evaluateTransitionRequirementPreflight } from "@/lib/lifecycle/evaluateTransitionRequirementPreflight";
import { formatTransitionReadinessBlockMessage } from "@/lib/lifecycle/preflightStageChangingOutcomeReadiness";

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
 *   1. move_to_stage → waitlist (crosses the child-grain boundary: track + stage + work reconciliation)
 *   2. update_child_enrollment_status → waitlisted (on that track; OCM + placement candidate)
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
    /** Required for transition readiness preflight (Program etc.). */
    departmentMetadata?: Record<string, unknown> | null;
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

    // Transition-specific readiness — block before any status/stage/work mutation.
    let departmentMetadata = params.departmentMetadata ?? null;
    if (!departmentMetadata && params.departmentId) {
        const { data: deptRow } = await params.supabase
            .from("departments")
            .select("metadata")
            .eq("id", params.departmentId)
            .eq("org_id", params.orgId)
            .maybeSingle();
        departmentMetadata =
            deptRow?.metadata != null
            && typeof deptRow.metadata === "object"
            && !Array.isArray(deptRow.metadata)
                ? (deptRow.metadata as Record<string, unknown>)
                : {};
    }
    if (departmentMetadata) {
        const readiness = await evaluateTransitionRequirementPreflight({
            supabase: params.supabase,
            orgId: params.orgId,
            opportunityId,
            departmentMetadata,
            fromBuilderStageKey: plan.stage_key,
            toBuilderStageKey: CHILD_WAITLIST_STAGE_KEY,
            previousStatusKey: plan.stage_key,
            nextStatusKey: CHILD_WAITLIST_STAGE_KEY,
            nextStageLabel: "Waitlist",
            customerMemberId,
            opportunityCustomerMemberId: trimOrNull(params.opportunityCustomerMemberId),
        });
        if (readiness.blockingRequirements.length) {
            return {
                ok: false,
                error: formatTransitionReadinessBlockMessage(readiness.blockingRequirements),
            };
        }
    }

    /*
     * THE STAGE MOVE FIRST, THEN THE DISPOSITION.
     *
     * A child at a family-grain stage (Lead, Tour, Decision) has no Enrollment track of their own:
     * by doctrine the track begins at their FIRST move into a child-grain stage, and the canonical
     * place that boundary is crossed is the executor's child `move_to_stage` branch, after its
     * referential-integrity and grain guards (the one track bootstrap lives there and only there).
     *
     * This command used to write the `waitlisted` disposition FIRST. The disposition is written onto
     * the child's track, so for every child still in the family segment it found no track, wrote
     * nothing, and refused with "Could not record the enrollment path for this child — no enrollment
     * track was found for them on this lead" before the boundary was ever reached. The manual
     * transition, which skips the status step, never hit it; this command always did (E2E-06).
     *
     * So the move runs first and crosses the boundary exactly once, through the one owner; the
     * disposition is then recorded on the track that crossing established. No track is created
     * here, and nothing is created for a destination the guards refuse.
     */
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
        return { ok: false, error: moveResult.error };
    }

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
        // Keep the progression atomic from the operator's view: put the child back where they were.
        if (moveResult.undo) {
            try {
                await moveResult.undo();
            } catch (e) {
                return {
                    ok: false,
                    error: `Waitlist status failed (${statusResult.error}); stage rollback also failed: ${
                        e instanceof Error ? e.message : String(e)
                    }`,
                };
            }
            return { ok: false, error: statusResult.error };
        }
        /*
         * A FIRST crossing has no prior child stage to restore (the track began with this move), so
         * the child stays at Waitlist without the disposition. Said plainly rather than hidden: the
         * command is safe to repeat — the move is a no-op onto the same stage and the disposition is
         * written on the existing track.
         */
        return {
            ok: false,
            error: `${statusResult.error} The child was moved to Waitlist but the waitlist status was not recorded — run Move to Waitlist again to complete it.`,
        };
    }

    const degraded = [statusResult.degraded, moveResult.degraded].filter(Boolean).join("; ") || undefined;
    return {
        ok: true,
        opportunity_id: opportunityId,
        customer_member_id: customerMemberId,
        degraded,
    };
}

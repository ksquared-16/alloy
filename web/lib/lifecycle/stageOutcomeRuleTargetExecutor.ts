/**
 * Generic executor for stage_operating_plan_v1 outcome rule targets.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { instantiateStageWorkFromTemplate } from "@/lib/lifecycle/instantiateStageWorkFromTemplate";
import {
    mergeEnrollmentOperationalIntoMetadata,
    sanitizeEnrollmentOperationalPatch,
} from "@/lib/opportunities/enrollmentOperationalMetadata";
import { updateOpportunityStatusWithEvent } from "@/lib/opportunities/updateOpportunityStatusWithEvent";
import type { StageOperatingPlanV1, StageOutcomeRuleTargetV1 } from "@/lib/lifecycle/stageOperatingPlanV1";
import { reopenStageWorkWithDueDate } from "@/lib/lifecycle/reopenStageWorkWithDueDate";
import {
    moveEnrollmentInstanceStageByScope,
    setEnrollmentInstanceStateByScope,
    readEnrollmentInstanceState,
    type EnrollmentProcessState,
} from "@/lib/process/processInstances";
import { ensurePlacementCandidateForWaitlistedChild } from "@/lib/orchestration/placement/placementCandidateLifecycleHook";
import { emitChildLifecycleStatusChangedEvent } from "@/lib/opportunities/emitChildLifecycleStatusChangedEvent";
import { materializeEnrollmentForChildScope } from "@/lib/childcareOperational/materializeEnrollmentFromProcessInstance";
import { isChildcareOperationalEnrollmentV1EnabledForOrg } from "@/lib/childcareOperational/featureFlag";

export type StageOutcomeExecutionSubject = {
    journey_segment: "family" | "child";
    opportunity_id: string;
    /** Child subject = customer_members.id. Threaded so movement targets the process instance directly. */
    customer_member_id?: string | null;
    /** Optional direct process-instance id (most specific child identity). */
    process_instance_id?: string | null;
    /** Legacy OCM id (temporary bridge; only used to resolve the child when customer_member_id is absent). */
    opportunity_customer_member_id?: string | null;
    placement_candidate_id?: string | null;
    /** Open lifecycle work task for repeat/reopen automations. */
    work_id?: string | null;
};

/**
 * Resolve the child subject (customer_members.id) that a child movement targets. Prefers the
 * identity threaded on the subject (customer_member_id) — NO OCM read. Falls back to an OCM lookup
 * ONLY for legacy callers that still carry just the OCM id; that fallback is removed with OCM.
 */
async function resolveChildSubjectId(
    supabase: SupabaseClient,
    orgId: string,
    subject: StageOutcomeExecutionSubject,
): Promise<string | null> {
    const direct = subject.customer_member_id?.trim();
    if (direct) return direct;
    const ocmId = subject.opportunity_customer_member_id?.trim();
    if (!ocmId) return null;
    // Legacy bridge read: old task/queue payloads carried only the OCM id. Temporary — removed with OCM.
    const { data } = await supabase
        .from("opportunity_customer_members")
        .select("customer_member_id")
        .eq("id", ocmId)
        .eq("org_id", orgId)
        .maybeSingle();
    const id = (data as { customer_member_id?: string } | null)?.customer_member_id;
    return typeof id === "string" && id.trim() ? id.trim() : null;
}

export async function applyStageOutcomeRuleTarget(
    supabase: SupabaseClient,
    params: {
        orgId: string;
        userId: string;
        departmentId: string;
        stageKey: string;
        plan: StageOperatingPlanV1;
        subject: StageOutcomeExecutionSubject;
        target: StageOutcomeRuleTargetV1;
    },
): Promise<{ error?: string; needs_attention?: boolean; status_updated?: boolean }> {
    const { orgId, userId, subject, target, plan, stageKey, departmentId } = params;

    switch (target.kind) {
        case "no_movement":
        case "mark_stage_work_complete":
            return {};

        case "update_family_case_status": {
            const statusKey = target.status_key?.trim();
            if (!statusKey) return { error: "Missing family case status key" };
            const closeReasonKey = target.close_reason_key?.trim();
            const res = await updateOpportunityStatusWithEvent({
                supabase,
                orgId,
                opportunityId: subject.opportunity_id,
                newStatusKey: statusKey,
                actorUserId: userId,
                normalizeContext: "stage_operating_plan_outcome",
                // Persist close reason alongside the durable status (S4 collapse).
                ...(closeReasonKey ? { additionalPatch: { close_reason_key: closeReasonKey } } : {}),
                eventMetadata: { source: "stage_operating_plan_v1", stage_key: stageKey },
            });
            if (res.error) return { error: res.error.message };
            return { status_updated: true };
        }

        case "update_child_enrollment_status": {
            const dispositionKey = target.disposition_key?.trim();
            if (!dispositionKey) return { error: "Child enrollment disposition required" };
            // Resolve the child from the threaded identity (no OCM read on the primary path).
            const childId = await resolveChildSubjectId(supabase, orgId, subject);
            if (!childId) return { error: "Could not resolve child for enrollment state update" };
            // Prior state (from process_instances, not OCM) for the transition event.
            const prevState = await readEnrollmentInstanceState(supabase, {
                orgId,
                opportunityId: subject.opportunity_id,
                customerMemberId: childId,
            });
            // Authoritative writer: the child's process instance owns durable state + close reason.
            // The OCM durable enrollment-status column is NOT written — process_instances is the
            // single source of truth for child participation state.
            const closeReasonKey = target.close_reason_key?.trim() || undefined;
            const pi = await setEnrollmentInstanceStateByScope(supabase, {
                orgId,
                opportunityId: subject.opportunity_id,
                customerMemberId: childId,
                state: dispositionKey as EnrollmentProcessState,
                closeReasonKey,
            });
            if (pi.error) return { error: pi.error };

            const ocmBridgeId = subject.opportunity_customer_member_id?.trim() ?? null;
            // Child lifecycle event emitted from the process-instance transition (restored). While the
            // OCM bridge exists the event stays keyed on the OCM id so existing workflow subscriptions
            // (entity_type=opportunity_customer_members) keep firing; it re-keys to process_instances
            // when OCM is dropped.
            if (ocmBridgeId && prevState !== dispositionKey) {
                try {
                    await emitChildLifecycleStatusChangedEvent({
                        supabase,
                        orgId,
                        opportunityId: subject.opportunity_id,
                        opportunityCustomerMemberId: ocmBridgeId,
                        previousStatusKey: prevState,
                        nextStatusKey: dispositionKey,
                        actorUserId: userId,
                        source: "stage_operating_plan_v1",
                        rowGrain: "child",
                    });
                } catch (e) {
                    console.error("[stageOutcomeRuleTargetExecutor] child lifecycle event", e);
                }
            }
            // Preserve the waitlist placement flow (reads OCM as bridge data only).
            if (dispositionKey === "waitlisted" && ocmBridgeId) {
                await ensurePlacementCandidateForWaitlistedChild(supabase, {
                    orgId,
                    opportunityId: subject.opportunity_id,
                    opportunityCustomerMemberId: ocmBridgeId,
                });
            }
            // Enrollment completion → materialize durable operational truth (agreement + placement +
            // schedule assignment). The process produces the facts; it does not own them. Non-blocking
            // and idempotent — a failure here must not roll back the state transition (retryable).
            if (dispositionKey === "enrolled" && (await isChildcareOperationalEnrollmentV1EnabledForOrg(supabase, orgId))) {
                try {
                    await materializeEnrollmentForChildScope(supabase, {
                        orgId,
                        opportunityId: subject.opportunity_id,
                        customerMemberId: childId,
                        userId,
                    });
                } catch (e) {
                    console.error("[stageOutcomeRuleTargetExecutor] enrollment materialization", e);
                }
            }
            return { status_updated: true };
        }

        case "update_candidate_status": {
            const candidateId = subject.placement_candidate_id?.trim();
            const candidateStatus = target.candidate_status;
            if (!candidateId || !candidateStatus) {
                return { error: "Waitlist candidate required for candidate status update" };
            }
            const { error } = await supabase
                .from("placement_candidates")
                .update({ status: candidateStatus, updated_at: new Date().toISOString() })
                .eq("id", candidateId)
                .eq("org_id", orgId);
            if (error) return { error: error.message };
            return { status_updated: true };
        }

        case "create_needs_attention": {
            const { data: opp, error: loadErr } = await supabase
                .from("opportunities")
                .select("id, metadata")
                .eq("id", subject.opportunity_id)
                .eq("org_id", orgId)
                .maybeSingle();
            if (loadErr || !opp) return { error: loadErr?.message ?? "Opportunity not found" };

            const patch = sanitizeEnrollmentOperationalPatch({
                wait_bucket: target.wait_bucket ?? "waiting_on_staff",
                wait_reason: target.attention_reason ?? "Lifecycle stage attention rule",
                wait_since: new Date().toISOString(),
            });
            const metadata =
                opp.metadata != null && typeof opp.metadata === "object" && !Array.isArray(opp.metadata)
                    ? (opp.metadata as Record<string, unknown>)
                    : {};
            const merged = mergeEnrollmentOperationalIntoMetadata(metadata, patch ?? {});

            const { error: upErr } = await supabase
                .from("opportunities")
                .update({ metadata: merged, updated_at: new Date().toISOString() })
                .eq("id", subject.opportunity_id)
                .eq("org_id", orgId);
            if (upErr) return { error: upErr.message };
            return { needs_attention: true };
        }

        case "create_next_work": {
            const templateKey = target.template_key?.trim();
            if (!templateKey) return { error: "Missing work template key" };
            const workTpl = plan.work_templates.find((t) => t.template_key === templateKey);
            if (!workTpl) return { error: `Unknown work template: ${templateKey}` };
            const result = await instantiateStageWorkFromTemplate({
                supabase,
                orgId,
                userId,
                opportunityId: subject.opportunity_id,
                stageKey,
                departmentId,
                template: workTpl,
                dueDaysOverride: target.due_days,
            });
            if (result.status === "rejected") {
                return { error: result.error };
            }
            return {};
        }

        case "reopen_work": {
            const workId = subject.work_id?.trim();
            if (!workId) return { error: "Open work required to repeat work item" };
            const dueDays =
                typeof target.due_days === "number" && Number.isFinite(target.due_days) ?
                    Math.max(0, Math.floor(target.due_days))
                :   1;
            const reopened = await reopenStageWorkWithDueDate({
                supabase,
                orgId,
                workId,
                dueDays,
            });
            if (!reopened.ok) return { error: reopened.error };
            return {};
        }

        case "move_to_stage": {
            // Stage is a persisted process-state column (S4). Outcome execution is the
            // authoritative writer of stage_key on the family case or the child track.
            const targetStageKey = target.stage_key?.trim();
            if (!targetStageKey) return { error: "Missing target stage key" };
            const nowIso = new Date().toISOString();
            if (subject.journey_segment === "child") {
                // Authoritative + only writer: the child's process instance owns stage_key.
                // (The OCM stage_key mirror write was removed — OCM is no longer a runtime dependency
                // for child movement.)
                const childId = await resolveChildSubjectId(supabase, orgId, subject);
                if (!childId) return { error: "Child enrollment track required for move_to_stage" };
                const pi = await moveEnrollmentInstanceStageByScope(supabase, {
                    orgId,
                    opportunityId: subject.opportunity_id,
                    customerMemberId: childId,
                    stageKey: targetStageKey,
                });
                if (pi.error) return { error: pi.error };
                return {};
            }
            const { error } = await supabase
                .from("opportunities")
                .update({ stage_key: targetStageKey, updated_at: nowIso })
                .eq("id", subject.opportunity_id)
                .eq("org_id", orgId);
            if (error) return { error: error.message };
            return {};
        }

        default:
            return { error: `Unsupported target kind` };
    }
}

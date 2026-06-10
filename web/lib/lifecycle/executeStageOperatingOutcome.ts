/**
 * Execute stage_operating_plan_v1 outcome rule targets (V1 scoped).
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { instantiateWorkFromDefinition } from "@/lib/admin/operationalWork/instantiateWorkFromDefinition";
import {
    mergeEnrollmentOperationalIntoMetadata,
    sanitizeEnrollmentOperationalPatch,
} from "@/lib/opportunities/enrollmentOperationalMetadata";
import { updateOpportunityCustomerMemberLifecycleStatus } from "@/lib/opportunities/updateOpportunityCustomerMemberLifecycleStatus";
import { updateOpportunityStatusWithEvent } from "@/lib/opportunities/updateOpportunityStatusWithEvent";
import type {
    StageOperatingPlanV1,
    StageOutcomeRuleTargetV1,
} from "@/lib/lifecycle/stageOperatingPlanV1";
import { outcomeRulesForKey } from "@/lib/lifecycle/stageOperatingPlanV1";

export type StageOutcomeExecutionSubject = {
    journey_segment: "family" | "child";
    opportunity_id: string;
    opportunity_customer_member_id?: string | null;
    placement_candidate_id?: string | null;
};

export type StageOutcomeExecutionResult = {
    applied_targets: StageOutcomeRuleTargetV1[];
    errors: string[];
    queue_refresh_opportunity_id: string;
    needs_attention_set: boolean;
    status_updated: boolean;
};

async function applyTarget(
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
            const res = await updateOpportunityStatusWithEvent({
                supabase,
                orgId,
                opportunityId: subject.opportunity_id,
                newStatusKey: statusKey,
                actorUserId: userId,
                normalizeContext: "stage_operating_plan_outcome",
                eventMetadata: { source: "stage_operating_plan_v1", stage_key: stageKey },
            });
            if (res.error) return { error: res.error.message };
            return { status_updated: true };
        }

        case "update_child_enrollment_status": {
            const dispositionKey = target.disposition_key?.trim();
            const ocmId = subject.opportunity_customer_member_id?.trim();
            if (!dispositionKey || !ocmId) {
                return { error: "Child enrollment track required for disposition update" };
            }
            const res = await updateOpportunityCustomerMemberLifecycleStatus({
                supabase,
                orgId,
                opportunityId: subject.opportunity_id,
                opportunityCustomerMemberId: ocmId,
                nextStatusKey: dispositionKey,
                actorUserId: userId,
                source: "stage_operating_plan_v1",
                rowGrain: "child",
            });
            if (res.error) return { error: res.error.message };
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
            const definitionKey = workTpl?.work_definition_key?.trim() || "manual_ad_hoc";
            const result = await instantiateWorkFromDefinition({
                supabase,
                orgId,
                userId,
                workDefinitionKey: definitionKey,
                subject: { entityType: "opportunities", entityId: subject.opportunity_id },
                provenance: { source: "lifecycle_template" },
                contextSnapshot: { lifecycle_stage_key: stageKey },
                titleOverride: workTpl?.label,
                resolveParams: { departmentMetadata: null, stageKey },
            });
            if (result.status === "rejected") {
                return { error: result.message ?? result.reason };
            }
            return {};
        }

        case "move_to_stage":
            // V1: movement is queue-membership driven via status/disposition updates in sibling rules.
            return {};

        default:
            return { error: `Unsupported target kind` };
    }
}

export async function executeStageOperatingOutcome(params: {
    supabase: SupabaseClient;
    orgId: string;
    userId: string;
    departmentId: string;
    plan: StageOperatingPlanV1;
    outcomeKey: string;
    subject: StageOutcomeExecutionSubject;
}): Promise<StageOutcomeExecutionResult> {
    const rules = outcomeRulesForKey(params.plan, params.outcomeKey);
    const applied_targets: StageOutcomeRuleTargetV1[] = [];
    const errors: string[] = [];
    let needs_attention_set = false;
    let status_updated = false;

    for (const rule of rules) {
        for (const target of rule.targets) {
            const result = await applyTarget(params.supabase, {
                orgId: params.orgId,
                userId: params.userId,
                departmentId: params.departmentId,
                stageKey: params.plan.stage_key,
                plan: params.plan,
                subject: params.subject,
                target,
            });
            applied_targets.push(target);
            if (result.error) errors.push(result.error);
            if (result.needs_attention) needs_attention_set = true;
            if (result.status_updated) status_updated = true;
        }
    }

    return {
        applied_targets,
        errors,
        queue_refresh_opportunity_id: params.subject.opportunity_id,
        needs_attention_set,
        status_updated,
    };
}

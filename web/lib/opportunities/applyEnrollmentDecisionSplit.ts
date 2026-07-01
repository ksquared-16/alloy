/**
 * Apply per-child Decision split outcomes — independent OCM lifecycle updates.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { resolveDecisionSplitOutcomeStatusKey } from "@/lib/businessProcesses/resolveDecisionSplitOutcomeStatusKey";
import { splitRuleForStage } from "@/lib/businessProcesses/businessProcessConfigReader";
import {
    activeLifecycleProcess,
    lifecycleBuilderFromDepartmentMetadata,
} from "@/lib/lifecycle/lifecycleBuilderConfig";
import { updateOpportunityCustomerMemberLifecycleStatus } from "@/lib/opportunities/updateOpportunityCustomerMemberLifecycleStatus";

export type DecisionSplitChildSelection = {
    /** opportunity_customer_members.id when linked; else customer_member_id for ensure-link. */
    opportunity_customer_member_id?: string | null;
    customer_member_id?: string | null;
    outcome_key: string;
};

export type ApplyEnrollmentDecisionSplitParams = {
    supabase: SupabaseClient;
    orgId: string;
    opportunityId: string;
    departmentMetadata: unknown;
    selections: DecisionSplitChildSelection[];
    actorUserId?: string | null;
    source?: string | null;
};

export type ApplyEnrollmentDecisionSplitChildResult = {
    opportunity_customer_member_id: string;
    customer_member_id: string | null;
    outcome_key: string;
    skipped: boolean;
    previous_status_key: string | null;
    next_status_key: string | null;
    error?: string;
};

export type ApplyEnrollmentDecisionSplitResult =
    | {
          error: null;
          applied: ApplyEnrollmentDecisionSplitChildResult[];
      }
    | { error: { message: string } };

function trimOrNull(raw: unknown): string | null {
    if (raw == null) return null;
    const t = String(raw).trim();
    return t || null;
}

async function ensureOcmLink(params: {
    supabase: SupabaseClient;
    orgId: string;
    opportunityId: string;
    customerMemberId: string;
}): Promise<{ ocmId: string } | { error: string }> {
    const cmId = params.customerMemberId.trim();
    const { data: existing } = await params.supabase
        .from("opportunity_customer_members")
        .select("id")
        .eq("org_id", params.orgId)
        .eq("opportunity_id", params.opportunityId)
        .eq("customer_member_id", cmId)
        .maybeSingle();
    if (existing?.id) return { ocmId: String(existing.id) };

    const { data: created, error } = await params.supabase
        .from("opportunity_customer_members")
        .insert({
            org_id: params.orgId,
            opportunity_id: params.opportunityId,
            customer_member_id: cmId,
        })
        .select("id")
        .single();
    if (error || !created?.id) {
        return { error: error?.message ?? "Could not link child to opportunity" };
    }
    return { ocmId: String(created.id) };
}

export async function applyEnrollmentDecisionSplit(
    params: ApplyEnrollmentDecisionSplitParams
): Promise<ApplyEnrollmentDecisionSplitResult> {
    const oppId = params.opportunityId.trim();
    if (!oppId) return { error: { message: "opportunityId is required" } };

    const builder = lifecycleBuilderFromDepartmentMetadata(params.departmentMetadata);
    const process = builder ? activeLifecycleProcess(builder) : null;
    const splitRule = process ? splitRuleForStage(process, "decision") : null;
    if (!splitRule) {
        return { error: { message: "Decision split is not configured for this process" } };
    }

    const outcomeByKey = new Map(splitRule.per_subject_outcomes.map((o) => [o.outcome_key, o]));
    const applied: ApplyEnrollmentDecisionSplitChildResult[] = [];

    for (const sel of params.selections) {
        const outcomeKey = trimOrNull(sel.outcome_key);
        if (!outcomeKey) continue;

        const splitOutcome = outcomeByKey.get(outcomeKey) ?? null;
        const nextStatusKey = resolveDecisionSplitOutcomeStatusKey({
            outcomeKey,
            splitOutcome,
            process,
        });

        let ocmId = trimOrNull(sel.opportunity_customer_member_id);
        const cmId = trimOrNull(sel.customer_member_id);

        if (!ocmId && cmId) {
            const linked = await ensureOcmLink({
                supabase: params.supabase,
                orgId: params.orgId,
                opportunityId: oppId,
                customerMemberId: cmId,
            });
            if ("error" in linked) {
                applied.push({
                    opportunity_customer_member_id: "",
                    customer_member_id: cmId,
                    outcome_key: outcomeKey,
                    skipped: true,
                    previous_status_key: null,
                    next_status_key: null,
                    error: linked.error,
                });
                continue;
            }
            ocmId = linked.ocmId;
        }

        if (!ocmId) {
            applied.push({
                opportunity_customer_member_id: "",
                customer_member_id: cmId,
                outcome_key: outcomeKey,
                skipped: true,
                previous_status_key: null,
                next_status_key: null,
                error: "Child enrollment track id is required",
            });
            continue;
        }

        if (!nextStatusKey) {
            applied.push({
                opportunity_customer_member_id: ocmId,
                customer_member_id: cmId,
                outcome_key: outcomeKey,
                skipped: true,
                previous_status_key: null,
                next_status_key: null,
            });
            continue;
        }

        const res = await updateOpportunityCustomerMemberLifecycleStatus({
            supabase: params.supabase,
            orgId: params.orgId,
            opportunityId: oppId,
            opportunityCustomerMemberId: ocmId,
            nextStatusKey,
            actorUserId: params.actorUserId,
            source: params.source ?? "decision_split_v1",
            rowGrain: "child",
            metadata: { decision_split_outcome_key: outcomeKey },
        });

        if (res.error) {
            applied.push({
                opportunity_customer_member_id: ocmId,
                customer_member_id: cmId,
                outcome_key: outcomeKey,
                skipped: true,
                previous_status_key: null,
                next_status_key: nextStatusKey,
                error: res.error.message,
            });
            continue;
        }

        applied.push({
            opportunity_customer_member_id: ocmId,
            customer_member_id: cmId,
            outcome_key: outcomeKey,
            skipped: false,
            previous_status_key: res.before.outcome_status_key,
            next_status_key: res.after.outcome_status_key,
        });
    }

    return { error: null, applied };
}

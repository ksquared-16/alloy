import type { SupabaseClient } from "@supabase/supabase-js";

import type { WorkDefinitionAssigneePolicy } from "@/lib/admin/operationalWork/workDefinitionTypes";

/** Fetch opportunity record owner (`assigned_to`) for assignee policy resolution. */
export async function fetchOpportunityRecordOwnerUserId(params: {
    supabase: SupabaseClient;
    orgId: string;
    opportunityId: string;
}): Promise<string | null> {
    const opportunityId = params.opportunityId.trim();
    if (!opportunityId) return null;

    const { data, error } = await params.supabase
        .from("opportunities")
        .select("assigned_to")
        .eq("id", opportunityId)
        .eq("org_id", params.orgId)
        .maybeSingle();

    if (error || !data) return null;
    const assigned = (data as { assigned_to?: unknown }).assigned_to;
    return typeof assigned === "string" && assigned.trim() ? assigned.trim() : null;
}

/** Resolve assignee UUID; operator override wins. Role policy falls back to creator. */
export function resolveAssigneeFromWorkDefinitionPolicy(params: {
    assigneePolicy: WorkDefinitionAssigneePolicy;
    userId: string;
    recordOwnerUserId?: string | null;
    assigneeOverride?: string | null | undefined;
}): string | null {
    if (params.assigneeOverride !== undefined) {
        return params.assigneeOverride?.trim() || null;
    }

    switch (params.assigneePolicy.kind) {
        case "unassigned":
            return null;
        case "creator":
            return params.userId.trim();
        case "record_owner": {
            const owner = params.recordOwnerUserId?.trim();
            return owner || params.userId.trim();
        }
        case "role":
            return params.userId.trim();
        default:
            return params.userId.trim();
    }
}

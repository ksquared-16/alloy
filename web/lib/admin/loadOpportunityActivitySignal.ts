import type { SupabaseClient } from "@supabase/supabase-js";

import {
    fetchLatestWorkflowEventByOpportunityId,
    getActivitySignalForEntity,
    resolveActivitySignalRules,
    type ActivitySignalResult,
} from "@/lib/admin/activitySignals";

export type OpportunityActivitySignalOrgMetadata = {
    workUnitMetadata: unknown | null;
    departmentMetadata: unknown | null;
};

export type LoadOpportunityActivitySignalInput = {
    supabase: SupabaseClient;
    orgId: string;
    opportunityId: string;
    statusKey: string | null;
    workUnitId: string | null;
    /**
     * When provided, skips `work_units` and `departments` queries — same metadata
     * resolution as `GET /api/admin/opportunities/:id/activity-signal`.
     */
    preloadedOrgMetadata?: OpportunityActivitySignalOrgMetadata | null;
    nowMs?: number;
};

/**
 * Activity Signals V1 for a single opportunity — shared by entity GET attachment and the activity-signal route.
 */
export async function loadOpportunityActivitySignal(input: LoadOpportunityActivitySignalInput): Promise<ActivitySignalResult> {
    let workUnitMetadata: unknown | null = null;
    let departmentMetadata: unknown | null = null;

    if (input.preloadedOrgMetadata) {
        workUnitMetadata = input.preloadedOrgMetadata.workUnitMetadata;
        departmentMetadata = input.preloadedOrgMetadata.departmentMetadata;
    } else if (input.workUnitId?.trim()) {
        const wuid = input.workUnitId.trim();
        const { data: wu } = await input.supabase
            .from("work_units")
            .select("metadata, department_id")
            .eq("id", wuid)
            .eq("org_id", input.orgId)
            .maybeSingle();
        workUnitMetadata = (wu as { metadata?: unknown } | null)?.metadata ?? null;
        const deptId = String((wu as { department_id?: string | null } | null)?.department_id ?? "").trim();
        if (deptId) {
            const { data: deptRow } = await input.supabase
                .from("departments")
                .select("metadata")
                .eq("id", deptId)
                .eq("org_id", input.orgId)
                .maybeSingle();
            departmentMetadata = (deptRow as { metadata?: unknown } | null)?.metadata ?? null;
        }
    }

    const rules = resolveActivitySignalRules(workUnitMetadata, departmentMetadata);

    let latestById: Awaited<ReturnType<typeof fetchLatestWorkflowEventByOpportunityId>> = new Map();
    try {
        latestById = await fetchLatestWorkflowEventByOpportunityId(input.supabase, input.orgId, [input.opportunityId]);
    } catch {
        latestById = new Map();
    }
    const ev = latestById.get(input.opportunityId);
    const events = ev ? [ev] : [];

    return getActivitySignalForEntity({
        events,
        entity: { id: input.opportunityId, status_key: input.statusKey },
        rules,
        nowMs: input.nowMs ?? Date.now(),
    });
}

/** Loads `departments.metadata` for activity rules when the work unit row already provided `department_id`. */
export async function fetchDepartmentMetadataForActivity(
    supabase: SupabaseClient,
    orgId: string,
    departmentId: string | null | undefined,
): Promise<unknown | null> {
    const id = departmentId != null && String(departmentId).trim() !== "" ? String(departmentId).trim() : "";
    if (!id) return null;
    const { data } = await supabase.from("departments").select("metadata").eq("id", id).eq("org_id", orgId).maybeSingle();
    return (data as { metadata?: unknown } | null)?.metadata ?? null;
}

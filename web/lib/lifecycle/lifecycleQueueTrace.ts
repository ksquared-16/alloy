/**
 * Read-only helpers for lifecycle queue record tracing (scripts + dev empty-queue debug).
 * Operator-triggered only — not used on workspace/dept/work-unit hot paths except dev debug on empty lanes.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { LifecycleOpportunityQueueScope } from "@/lib/lifecycle/lifecycleOpportunityQueueScope";
import { applyOpportunityQueueWorkUnitScope } from "@/lib/lifecycle/lifecycleOpportunityQueueScope";
import type { QueueConfig, QueueFilter } from "@/lib/config/queueDefinitionSchema";

export type LifecycleQueueTraceFilterEquivalent = {
    org_id: string;
    scope_mode:
        | "work_unit_id"
        | "lifecycle_visibility"
        | "legacy_pipeline"
        | "assignment_home";
    work_unit_scope_sql: string;
    status_keys: string[];
    lifecycle_visibility_scope_applied: boolean;
    department_work_unit_ids: string[];
    lifecycle_work_unit_id?: string;
    stage_key?: string;
};

function statusKeysFromQueueFilters(filters: readonly QueueFilter[]): string[] {
    const keys: string[] = [];
    for (const f of filters) {
        if (f.type !== "status" || f.operator !== "in") continue;
        for (const v of f.values ?? []) {
            const k = String(v ?? "").trim();
            if (k) keys.push(k);
        }
    }
    return [...new Set(keys.map((k) => k.toLowerCase()))];
}

export function describeLifecycleQueueScopeFilter(
    scope: LifecycleOpportunityQueueScope,
    _departmentWorkUnitIds: readonly string[]
): Pick<
    LifecycleQueueTraceFilterEquivalent,
    "scope_mode" | "work_unit_scope_sql" | "lifecycle_visibility_scope_applied"
> {
    if (scope.mode === "work_unit_id") {
        return {
            scope_mode: "work_unit_id",
            work_unit_scope_sql: `work_unit_id = '${scope.workUnitId}'`,
            lifecycle_visibility_scope_applied: false,
        };
    }
    return {
        scope_mode: "lifecycle_visibility",
        work_unit_scope_sql: "(no work_unit_id gate — org + status + lane filters)",
        lifecycle_visibility_scope_applied: true,
    };
}

export function buildLifecycleQueueFilterEquivalent(params: {
    orgId: string;
    scope: LifecycleOpportunityQueueScope;
    departmentWorkUnitIds: readonly string[];
    statusKeys: readonly string[];
}): LifecycleQueueTraceFilterEquivalent {
    const scopeDesc = describeLifecycleQueueScopeFilter(params.scope, params.departmentWorkUnitIds);
    return {
        org_id: params.orgId,
        ...scopeDesc,
        status_keys: [...params.statusKeys],
        department_work_unit_ids: [...params.departmentWorkUnitIds],
        ...(params.scope.mode === "lifecycle_visibility"
            ? {
                  lifecycle_work_unit_id: params.scope.lifecycleWorkUnitId,
                  stage_key: params.scope.stageKey,
              }
            : {}),
    };
}

export function queueStatusKeysFromQueueConfig(queue: QueueConfig): string[] {
    return statusKeysFromQueueFilters(queue.filters ?? []);
}

/** Parallel head counts — bounded keys only (trace / dev debug). */
export async function countOpportunitiesByStatusKeys(
    supabase: SupabaseClient,
    orgId: string,
    statusKeys: readonly string[]
): Promise<Record<string, number>> {
    const out: Record<string, number> = {};
    await Promise.all(
        statusKeys.map(async (sk) => {
            const key = sk.trim().toLowerCase();
            if (!key) return;
            const { count, error } = await supabase
                .from("opportunities")
                .select("id", { count: "exact", head: true })
                .eq("org_id", orgId)
                .eq("status_key", key);
            if (error) throw new Error(error.message);
            out[key] = count ?? 0;
        })
    );
    return out;
}

export async function countOpportunitiesByWorkUnitIds(
    supabase: SupabaseClient,
    orgId: string,
    workUnitIds: readonly string[]
): Promise<Record<string, number>> {
    const out: Record<string, number> = {};
    await Promise.all(
        workUnitIds.map(async (id) => {
            const wuId = id.trim();
            if (!wuId) return;
            const { count, error } = await supabase
                .from("opportunities")
                .select("id", { count: "exact", head: true })
                .eq("org_id", orgId)
                .eq("work_unit_id", wuId);
            if (error) throw new Error(error.message);
            out[wuId] = count ?? 0;
        })
    );
    return out;
}

export async function countOpportunitiesInLifecycleDepartmentScope(
    params: {
        supabase: SupabaseClient;
        orgId: string;
        statusKeys: readonly string[];
        departmentWorkUnitIds: readonly string[];
    }
): Promise<number> {
    const statusKeys = params.statusKeys.map((k) => k.trim().toLowerCase()).filter(Boolean);
    if (!statusKeys.length) return 0;
    const { count, error } = await params.supabase
        .from("opportunities")
        .select("id", { count: "exact", head: true })
        .eq("org_id", params.orgId)
        .in("status_key", [...statusKeys]);
    if (error) throw new Error(error.message);
    return count ?? 0;
}

export async function runLifecycleQueueCountQuery(params: {
    supabase: SupabaseClient;
    orgId: string;
    scope: LifecycleOpportunityQueueScope;
    departmentWorkUnitIds: readonly string[];
    statusKeys: readonly string[];
}): Promise<number> {
    const statusKeys = params.statusKeys.map((k) => k.trim().toLowerCase()).filter(Boolean);
    if (!statusKeys.length) return 0;
    let q = params.supabase
        .from("opportunities")
        .select("id", { count: "exact", head: true })
        .eq("org_id", params.orgId)
        .in("status_key", [...statusKeys]);
    q = applyOpportunityQueueWorkUnitScope(q, params.scope, params.departmentWorkUnitIds);
    const { count, error } = await q;
    if (error) throw new Error(error.message);
    return count ?? 0;
}

export async function fetchMatchingOpportunitySamples(params: {
    supabase: SupabaseClient;
    orgId: string;
    scope: LifecycleOpportunityQueueScope;
    departmentWorkUnitIds: readonly string[];
    statusKeys: readonly string[];
    limit?: number;
}): Promise<
    Array<{
        id: string;
        name: string | null;
        status_key: string | null;
        work_unit_id: string | null;
        created_at: string | null;
    }>
> {
    const statusKeys = params.statusKeys.map((k) => k.trim()).filter(Boolean);
    if (!statusKeys.length) return [];

    let q = params.supabase
        .from("opportunities")
        .select("id, name, status_key, work_unit_id, created_at")
        .eq("org_id", params.orgId)
        .in("status_key", [...statusKeys])
        .order("created_at", { ascending: false })
        .limit(params.limit ?? 25);

    q = applyOpportunityQueueWorkUnitScope(q, params.scope, params.departmentWorkUnitIds);

    const { data, error } = await q;
    if (error) throw new Error(error.message);
    return (data ?? []) as Array<{
        id: string;
        name: string | null;
        status_key: string | null;
        work_unit_id: string | null;
        created_at: string | null;
    }>;
}

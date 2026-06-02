/**
 * Builder-owned lifecycle stage work units — opportunity queue scope by status + department,
 * not strict opportunities.work_unit_id match (existing records may still point at legacy WUs).
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import {
    isLifecycleStageWorkUnitKey,
    stageKeyFromLifecycleWorkUnitMetadata,
    type LifecycleStageWorkUnitMetadata,
} from "@/lib/lifecycle/lifecycleStageWorkUnit";
import { expectedStatusKeysForLifecycleStageValidation } from "@/lib/lifecycle/lifecycleWorkUnitQueueValidation";
import type { LifecycleActivationV1 } from "@/lib/lifecycle/lifecycleActivationConfig";
import type { EnrollmentStatusStagesPayload } from "@/lib/lifecycle/enrollmentProcessStatusStageConfig";

export type LifecycleOpportunityQueueScope =
    | { mode: "work_unit_id"; workUnitId: string }
    | {
          mode: "lifecycle_status";
          departmentId: string;
          lifecycleWorkUnitId: string;
          stageKey: string;
      };

export function isLifecycleStageWorkUnitMetadata(metadata: unknown): boolean {
    if (metadata == null || typeof metadata !== "object" || Array.isArray(metadata)) return false;
    const m = metadata as LifecycleStageWorkUnitMetadata;
    return Boolean(
        m.lifecycle_builder_owned_v1?.builder_owned === true &&
            typeof m.lifecycle_stage_key === "string" &&
            m.lifecycle_stage_key.trim()
    );
}

export function resolveLifecycleOpportunityQueueScope(params: {
    workUnitId: string;
    workUnitKey?: string | null;
    workUnitMetadata?: unknown | null;
    departmentId?: string | null;
    /** When omitted, lifecycle stage WUs still resolve from row metadata (no dept fetch). */
    departmentMetadata?: unknown | null;
}): LifecycleOpportunityQueueScope {
    const departmentId = params.departmentId?.trim() ?? "";
    const key = (params.workUnitKey ?? "").trim().toLowerCase();
    const lifecycleMeta = isLifecycleStageWorkUnitMetadata(params.workUnitMetadata);

    if (departmentId && (isLifecycleStageWorkUnitKey(key) || lifecycleMeta)) {
        const stageKey =
            stageKeyFromLifecycleWorkUnitMetadata(params.workUnitMetadata) ??
            (key.startsWith("lifecycle_wu_") ? key.slice("lifecycle_wu_".length) : "");
        return {
            mode: "lifecycle_status",
            departmentId,
            lifecycleWorkUnitId: params.workUnitId,
            stageKey,
        };
    }
    return { mode: "work_unit_id", workUnitId: params.workUnitId };
}

/** Active work unit ids on the lifecycle department (includes legacy pipeline + lifecycle_wu_*). */
export async function listDepartmentWorkUnitIdsForOpportunityScope(
    supabase: SupabaseClient,
    orgId: string,
    departmentId: string
): Promise<string[]> {
    const { data, error } = await supabase
        .from("work_units")
        .select("id")
        .eq("org_id", orgId)
        .eq("department_id", departmentId)
        .eq("is_active", true);
    if (error) throw new Error(error.message);
    return (data ?? []).map((r) => String((r as { id: string }).id)).filter(Boolean);
}

/**
 * PostgREST filter: opportunities in org scoped to department work units (or unassigned work_unit_id).
 * Status filters are applied separately via queue ops.
 */
export function applyLifecycleDepartmentOpportunityScopeToQuery<T extends { or: (expr: string) => T }>(
    q: T,
    departmentWorkUnitIds: readonly string[]
): T {
    const ids = [...new Set(departmentWorkUnitIds.map((id) => id.trim()).filter(Boolean))];
    if (!ids.length) {
        return q.or("work_unit_id.is.null");
    }
    return q.or(`work_unit_id.is.null,work_unit_id.in.(${ids.join(",")})`);
}

export function applyOpportunityQueueWorkUnitScope<T extends { eq: (col: string, val: string) => T } & { or: (expr: string) => T }>(
    q: T,
    scope: LifecycleOpportunityQueueScope,
    departmentWorkUnitIds: readonly string[]
): T {
    if (scope.mode === "work_unit_id") {
        return q.eq("work_unit_id", scope.workUnitId);
    }
    if (departmentWorkUnitIds.length > 0) {
        return applyLifecycleDepartmentOpportunityScopeToQuery(q, departmentWorkUnitIds);
    }
    return q.eq("work_unit_id", scope.lifecycleWorkUnitId);
}

export type LifecycleOpportunityRecordCounts = {
    /** Matches status + department lifecycle scope (queue-visible). */
    matching_by_status: number;
    /** Subset already on this lifecycle work unit id. */
    assigned_to_lifecycle_work_unit: number;
    /** Status match in department scope but work_unit_id is not this lifecycle WU. */
    matching_elsewhere_in_department: number;
};

export async function countLifecycleOpportunityRecordsForWorkUnit(params: {
    supabase: SupabaseClient;
    orgId: string;
    departmentId: string;
    lifecycleWorkUnitId: string;
    statusKeys: readonly string[];
    departmentWorkUnitIds?: readonly string[];
}): Promise<LifecycleOpportunityRecordCounts> {
    const statusKeys = params.statusKeys.map((k) => k.trim()).filter(Boolean);
    if (!statusKeys.length) {
        return { matching_by_status: 0, assigned_to_lifecycle_work_unit: 0, matching_elsewhere_in_department: 0 };
    }

    const deptWuIds =
        params.departmentWorkUnitIds ??
        (await listDepartmentWorkUnitIdsForOpportunityScope(
            params.supabase,
            params.orgId,
            params.departmentId
        ));

    const base = () => {
        const q = params.supabase
            .from("opportunities")
            .select("id", { count: "exact", head: true })
            .eq("org_id", params.orgId)
            .in("status_key", [...statusKeys]);
        return applyLifecycleDepartmentOpportunityScopeToQuery(q, deptWuIds);
    };

    const [scopeRes, wuRes] = await Promise.all([
        base(),
        params.supabase
            .from("opportunities")
            .select("id", { count: "exact", head: true })
            .eq("org_id", params.orgId)
            .eq("work_unit_id", params.lifecycleWorkUnitId)
            .in("status_key", [...statusKeys]),
    ]);

    if (scopeRes.error) throw new Error(scopeRes.error.message);
    if (wuRes.error) throw new Error(wuRes.error.message);
    const matchingByStatus = scopeRes.count;
    const onWu = wuRes.count;

    const total = matchingByStatus ?? 0;
    const assigned = onWu ?? 0;
    return {
        matching_by_status: total,
        assigned_to_lifecycle_work_unit: assigned,
        matching_elsewhere_in_department: Math.max(0, total - assigned),
    };
}

export async function expectedStatusKeysForLifecycleWorkUnitRow(
    supabase: SupabaseClient,
    orgId: string,
    departmentId: string,
    stageKey: string,
    activation: LifecycleActivationV1,
    statusPayload: EnrollmentStatusStagesPayload | null,
    workUnitMetadata?: unknown
): Promise<string[]> {
    return expectedStatusKeysForLifecycleStageValidation(
        stageKey,
        statusPayload,
        activation,
        workUnitMetadata
    );
}

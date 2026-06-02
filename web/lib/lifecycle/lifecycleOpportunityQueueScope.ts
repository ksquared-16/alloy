/**
 * Builder-owned lifecycle stage work units — opportunity queue scope by lifecycle visibility,
 * not strict opportunities.work_unit_id match (assignment home is separate).
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
import {
    isLifecycleStageWorkUnitMetadata,
    resolveLifecycleVisibilityPredicate,
    type ResolvedLifecycleVisibilityPredicate,
} from "@/lib/lifecycle/lifecycleVisibilityEvaluator";

export type LifecycleOpportunityQueueScope =
    | { mode: "work_unit_id"; workUnitId: string }
    | {
          mode: "lifecycle_visibility";
          departmentId: string;
          lifecycleWorkUnitId: string;
          stageKey: string;
      };

export { isLifecycleStageWorkUnitMetadata };

export function resolveLifecycleOpportunityQueueScope(params: {
    workUnitId: string;
    workUnitKey?: string | null;
    workUnitMetadata?: unknown | null;
    departmentId?: string | null;
    departmentMetadata?: unknown | null;
    queueDefinition?: unknown | null;
    orgId?: string;
}): LifecycleOpportunityQueueScope {
    const departmentId = params.departmentId?.trim() ?? "";
    const predicate = resolveLifecycleVisibilityPredicate({
        orgId: params.orgId?.trim() || "scope",
        departmentId: departmentId || null,
        departmentMetadata: params.departmentMetadata,
        workUnitId: params.workUnitId,
        workUnitKey: params.workUnitKey,
        workUnitMetadata: params.workUnitMetadata,
        queueDefinition: params.queueDefinition,
    });

    if (predicate.query_mode === "lifecycle_visibility" && departmentId) {
        const stageKey =
            predicate.stage_key ??
            stageKeyFromLifecycleWorkUnitMetadata(params.workUnitMetadata) ??
            (isLifecycleStageWorkUnitKey(params.workUnitKey)
                ? String(params.workUnitKey).slice("lifecycle_wu_".length)
                : "");
        return {
            mode: "lifecycle_visibility",
            departmentId,
            lifecycleWorkUnitId: params.workUnitId,
            stageKey,
        };
    }
    return { mode: "work_unit_id", workUnitId: params.workUnitId };
}

/** Active work unit ids on the lifecycle department (assignment / attach diagnostics only). */
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
 * PostgREST filter: opportunities assigned within department work units (attach/cutover only).
 * Not used for lifecycle visibility lens queries.
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

export function applyOpportunityQueueWorkUnitScope<
    T extends { eq: (col: string, val: string) => T } & { or: (expr: string) => T },
>(q: T, scope: LifecycleOpportunityQueueScope, _departmentWorkUnitIds: readonly string[]): T {
    if (scope.mode === "lifecycle_visibility") {
        return q;
    }
    return q.eq("work_unit_id", scope.workUnitId);
}

export function applyLifecycleVisibilityPredicateToQuery<
    T extends { eq: (col: string, val: string) => T },
>(q: T, predicate: ResolvedLifecycleVisibilityPredicate): T {
    if (!predicate.requires_work_unit_visibility_gate) {
        return q;
    }
    return q.eq("work_unit_id", predicate.work_unit_id);
}

export type LifecycleOpportunityRecordCounts = {
    /** Visible by lifecycle filter (org + status; not gated on work_unit_id). */
    matching_by_status: number;
    /** Subset with assignment home on this lifecycle work unit. */
    assigned_to_lifecycle_work_unit: number;
    /** Visible by filter but assignment home is elsewhere. */
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
    const statusKeys = params.statusKeys.map((k) => k.trim().toLowerCase()).filter(Boolean);
    if (!statusKeys.length) {
        return { matching_by_status: 0, assigned_to_lifecycle_work_unit: 0, matching_elsewhere_in_department: 0 };
    }

    const [visibleRes, assignedRes] = await Promise.all([
        params.supabase
            .from("opportunities")
            .select("id", { count: "exact", head: true })
            .eq("org_id", params.orgId)
            .in("status_key", [...statusKeys]),
        params.supabase
            .from("opportunities")
            .select("id", { count: "exact", head: true })
            .eq("org_id", params.orgId)
            .eq("work_unit_id", params.lifecycleWorkUnitId)
            .in("status_key", [...statusKeys]),
    ]);

    if (visibleRes.error) throw new Error(visibleRes.error.message);
    if (assignedRes.error) throw new Error(assignedRes.error.message);

    const total = visibleRes.count ?? 0;
    const assigned = assignedRes.count ?? 0;
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

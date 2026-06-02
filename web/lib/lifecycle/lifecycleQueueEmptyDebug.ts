/**
 * Dev-only diagnostics when lifecycle opportunity queues return count 0.
 * Not attached in production; does not run on workspace/dept bootstrap unless summaries API is called.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { LifecycleOpportunityQueueScope } from "@/lib/lifecycle/lifecycleOpportunityQueueScope";
import {
    buildLifecycleQueueFilterEquivalent,
    countOpportunitiesByStatusKeys,
    countOpportunitiesByWorkUnitIds,
    countOpportunitiesInLifecycleDepartmentScope,
    queueStatusKeysFromQueueConfig,
    runLifecycleQueueCountQuery,
} from "@/lib/lifecycle/lifecycleQueueTrace";
import type { QueueConfig } from "@/lib/config/queueDefinitionSchema";

export type LifecycleQueueEmptyLaneDebug = {
    queue_key: string;
    queue_label: string;
    final_status_keys: string[];
    queue_api_count: number;
};

export type LifecycleQueueEmptyDebugPayload = {
    lifecycle_visibility_scope_applied: boolean;
    scope_mode:
        | "work_unit_id"
        | "lifecycle_visibility"
        | "legacy_pipeline"
        | "assignment_home";
    filter_equivalent: ReturnType<typeof buildLifecycleQueueFilterEquivalent>;
    department_work_unit_ids: string[];
    lanes: LifecycleQueueEmptyLaneDebug[];
    count_by_status_key: Record<string, number>;
    count_by_work_unit_id: Record<string, number>;
    /** Status keys in scope with dept WU ids (ignores per-lane queue filters). */
    department_scope_status_match_total: number;
    hint?: string;
};

export async function buildLifecycleQueueEmptyDebug(params: {
    supabase: SupabaseClient;
    orgId: string;
    scope: LifecycleOpportunityQueueScope;
    departmentWorkUnitIds: readonly string[];
    emptyLanes: Array<{ queue: QueueConfig; count: number }>;
    /** All status keys to sample for org/dept counts (union of lane filters + expected). */
    sampleStatusKeys: readonly string[];
}): Promise<LifecycleQueueEmptyDebugPayload> {
    const laneStatusKeys = new Set<string>();
    const lanes: LifecycleQueueEmptyLaneDebug[] = [];
    for (const { queue, count } of params.emptyLanes) {
        const keys = queueStatusKeysFromQueueConfig(queue);
        for (const k of keys) laneStatusKeys.add(k);
        lanes.push({
            queue_key: queue.key,
            queue_label: queue.label,
            final_status_keys: keys,
            queue_api_count: count,
        });
    }

    const sampleKeys = [
        ...new Set([
            ...params.sampleStatusKeys.map((k) => k.trim().toLowerCase()).filter(Boolean),
            ...laneStatusKeys,
        ]),
    ];

    const filter_equivalent = buildLifecycleQueueFilterEquivalent({
        orgId: params.orgId,
        scope: params.scope,
        departmentWorkUnitIds: params.departmentWorkUnitIds,
        statusKeys: sampleKeys,
    });

    const [count_by_status_key, count_by_work_unit_id, department_scope_status_match_total] = await Promise.all([
        countOpportunitiesByStatusKeys(params.supabase, params.orgId, sampleKeys),
        params.departmentWorkUnitIds.length
            ? countOpportunitiesByWorkUnitIds(params.supabase, params.orgId, params.departmentWorkUnitIds)
            : Promise.resolve({} as Record<string, number>),
        params.scope.mode === "lifecycle_visibility" && sampleKeys.length
            ? countOpportunitiesInLifecycleDepartmentScope({
                  supabase: params.supabase,
                  orgId: params.orgId,
                  statusKeys: sampleKeys,
                  departmentWorkUnitIds: params.departmentWorkUnitIds,
              })
            : Promise.all(
                  params.emptyLanes.map(async ({ queue }) =>
                      runLifecycleQueueCountQuery({
                          supabase: params.supabase,
                          orgId: params.orgId,
                          scope: params.scope,
                          departmentWorkUnitIds: params.departmentWorkUnitIds,
                          statusKeys: queueStatusKeysFromQueueConfig(queue),
                      })
                  )
              ).then((counts) => Math.max(0, ...counts, 0)),
    ]);

    const statusSum = Object.values(count_by_status_key).reduce((a, b) => a + b, 0);
    let hint: string | undefined;
    if (statusSum === 0 && sampleKeys.length) {
        hint =
            "No opportunities in org use these status keys. Check Settings status assignments vs opportunity.status_key (e.g. new_inquiry vs new_lead).";
    } else if (department_scope_status_match_total > 0 && lanes.every((l) => l.queue_api_count === 0)) {
        hint =
            "Records are visible by lifecycle status filter but queue lane filters may not include them. Check queue_definition status ops.";
    }

    return {
        lifecycle_visibility_scope_applied: filter_equivalent.lifecycle_visibility_scope_applied,
        scope_mode: filter_equivalent.scope_mode,
        filter_equivalent,
        department_work_unit_ids: filter_equivalent.department_work_unit_ids,
        lanes,
        count_by_status_key,
        count_by_work_unit_id,
        department_scope_status_match_total,
        ...(hint ? { hint } : {}),
    };
}

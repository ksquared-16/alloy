/**
 * Batch-attach `_stage_work_runtime` to opportunity queue rows using canonical projection.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import {
    configuredStageKeysForMetadata,
    lifecycleBuilderFromDepartmentMetadata,
} from "@/lib/lifecycle/lifecycleBuilderConfig";
import { effectiveStageKeyAssignment } from "@/lib/lifecycle/enrollmentOperatorStage";
import { projectStageWorkRuntimeSync } from "@/lib/lifecycle/projectStageWorkRuntime";
import type { StageWorkRuntimeProjection } from "@/lib/lifecycle/stageWorkRuntimeTypes";

type TaskDbRow = {
    id: string;
    title: string;
    due_at: string;
    status: string;
    source: string;
    metadata: Record<string, unknown> | null;
    updated_at: string;
    entity_id: string;
};

function trimOrNull(v: unknown): string | null {
    if (typeof v !== "string") return null;
    const s = v.trim();
    return s || null;
}

function resolveBuilderStageKeyForRow(
    row: Record<string, unknown>,
    departmentMetadata: Record<string, unknown>,
    queueStageKey: string | null,
): string | null {
    const laneStage = trimOrNull(queueStageKey);
    if (laneStage) return laneStage;

    const statusKey = trimOrNull(row.status_key);
    if (!statusKey) return null;

    const metadata =
        row.metadata != null && typeof row.metadata === "object" && !Array.isArray(row.metadata)
            ? (row.metadata as Record<string, unknown>)
            : null;

    const stageKeys = configuredStageKeysForMetadata(departmentMetadata);
    const { stage } = effectiveStageKeyAssignment(statusKey, metadata, stageKeys);
    return trimOrNull(stage);
}

function groupTasksByOpportunity(
    rows: TaskDbRow[],
): { openByOpp: Map<string, TaskDbRow[]>; completedByOpp: Map<string, TaskDbRow[]> } {
    const openByOpp = new Map<string, TaskDbRow[]>();
    const completedByOpp = new Map<string, TaskDbRow[]>();

    for (const row of rows) {
        const oppId = trimOrNull(row.entity_id);
        if (!oppId) continue;
        const status = trimOrNull(row.status) ?? "open";
        const bucket = status === "completed" ? completedByOpp : openByOpp;
        const list = bucket.get(oppId) ?? [];
        list.push(row);
        bucket.set(oppId, list);
    }

    return { openByOpp, completedByOpp };
}

export async function attachStageWorkRuntimeToOpportunityQueueRows(params: {
    supabase: SupabaseClient;
    orgId: string;
    rows: Array<Record<string, unknown>>;
    departmentId: string;
    departmentMetadata: Record<string, unknown>;
    queueStageKey?: string | null;
}): Promise<Array<Record<string, unknown>>> {
    const { rows, departmentMetadata, departmentId, orgId } = params;
    if (!rows.length) return rows;

    const builder = lifecycleBuilderFromDepartmentMetadata(departmentMetadata);
    if (!builder) return rows;

    const opportunityIds = rows
        .map((row) => trimOrNull(row.id))
        .filter((id): id is string => Boolean(id));
    if (!opportunityIds.length) return rows;

    const { data: taskRows, error } = await params.supabase
        .from("operational_tasks")
        .select("id, title, due_at, status, source, metadata, updated_at, entity_id")
        .eq("org_id", orgId)
        .eq("entity_type", "opportunities")
        .in("entity_id", opportunityIds)
        .in("status", ["open", "completed"])
        .order("updated_at", { ascending: false })
        .limit(Math.min(opportunityIds.length * 24, 500));

    const { openByOpp, completedByOpp } =
        error || !taskRows?.length
            ? { openByOpp: new Map<string, TaskDbRow[]>(), completedByOpp: new Map<string, TaskDbRow[]>() }
            : groupTasksByOpportunity(taskRows as TaskDbRow[]);

    return rows.map((row) => {
        const oppId = trimOrNull(row.id);
        if (!oppId) return row;

        const builderStageKey = resolveBuilderStageKeyForRow(
            row,
            departmentMetadata,
            params.queueStageKey ?? null,
        );
        if (!builderStageKey) return row;

        const runtime: StageWorkRuntimeProjection | null = projectStageWorkRuntimeSync({
            orgId,
            opportunityId: oppId,
            departmentId,
            departmentMetadata,
            builderStageKey,
            openRows: openByOpp.get(oppId) ?? [],
            completedRows: completedByOpp.get(oppId) ?? [],
        });

        return runtime ? { ...row, _stage_work_runtime: runtime } : row;
    });
}

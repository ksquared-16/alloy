/**
 * Resolve configured operational views (`perspectives_v1`) for a lifecycle stage.
 * Read-only — no I/O beyond parsing department metadata already on the client.
 */

import {
    activeLifecycleProcess,
    lifecycleBuilderFromDepartmentMetadata,
} from "@/lib/lifecycle/lifecycleBuilderConfig";
import { deriveQueueKeysFromQueueDefinition } from "@/lib/lifecycle/lifecycleStagePerspectiveLanes";
import { stageKeyFromLifecycleWorkUnitMetadata } from "@/lib/lifecycle/lifecycleStageWorkUnit";
import {
    coercePerspectivesV1ForLanes,
    resolvePerspectivesForStage,
    type PerspectiveConfigV1Stored,
} from "@/lib/lifecycle/perspectiveConfigV1";

/** Load coerced operational view rows for a builder stage + synced queue lanes. */
export function resolveStageOperationalViewsFromDepartmentMetadata(params: {
    departmentMetadata: unknown;
    stageKey: string | null | undefined;
    queueDefinition?: unknown;
}): PerspectiveConfigV1Stored[] {
    const stageKey = params.stageKey?.trim();
    if (!stageKey) return [];

    const builder = lifecycleBuilderFromDepartmentMetadata(params.departmentMetadata);
    const process = activeLifecycleProcess(builder);
    const stage = process?.stages.find((s) => s.key === stageKey && s.is_active);
    if (!stage) return [];

    const saved = resolvePerspectivesForStage(stage) ?? [];
    const laneKeys = deriveQueueKeysFromQueueDefinition(params.queueDefinition);
    return laneKeys.length ? coercePerspectivesV1ForLanes(saved, laneKeys) : saved;
}

/** Resolve operational views for any work unit — lifecycle stage WU or pipeline aggregate. */
export function resolveOperationalViewsForWorkUnit(params: {
    departmentMetadata: unknown;
    workUnitMetadata?: unknown;
    queueDefinition?: unknown;
}): PerspectiveConfigV1Stored[] {
    const stageKey = stageKeyFromLifecycleWorkUnitMetadata(params.workUnitMetadata ?? null);
    if (stageKey) {
        return resolveStageOperationalViewsFromDepartmentMetadata({
            departmentMetadata: params.departmentMetadata,
            stageKey,
            queueDefinition: params.queueDefinition,
        });
    }

    const laneKeys = deriveQueueKeysFromQueueDefinition(params.queueDefinition);
    if (!laneKeys.length) return [];

    const builder = lifecycleBuilderFromDepartmentMetadata(params.departmentMetadata);
    const process = activeLifecycleProcess(builder);
    if (!process) return [];

    const laneSet = new Set(laneKeys);
    const merged = new Map<string, PerspectiveConfigV1Stored>();
    for (const stage of process.stages) {
        if (!stage.is_active) continue;
        for (const row of resolvePerspectivesForStage(stage) ?? []) {
            if (!laneSet.has(row.queue_key)) continue;
            merged.set(row.queue_key, row);
        }
    }
    return [...merged.values()].sort(
        (a, b) =>
            (a.display_order ?? Number.MAX_SAFE_INTEGER) - (b.display_order ?? Number.MAX_SAFE_INTEGER)
            || a.queue_key.localeCompare(b.queue_key),
    );
}

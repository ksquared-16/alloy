/**
 * Atomic lifecycle work-unit + queue-key selection — prevents previous lane keys leaking on sibling pill switch.
 */

import { loadQueueDefinitionBundle } from "@/lib/config/queueDefinitionV2Runtime";
import { resolveWorkUnitFetchQueueKeyFromPill } from "@/lib/adminV2/workUnitQueueSelection";
import {
    isLifecycleWorkUnitNavChipKey,
    resolveLifecycleWorkUnitPrimaryQueueKey,
} from "@/lib/lifecycle/lifecycleWorkUnitShellPills";
import { stageKeyFromLifecycleWorkUnitMetadata } from "@/lib/lifecycle/lifecycleStageWorkUnit";

export type ActiveLifecycleWorkUnitSelection = {
    workUnitId: string;
    queueKey: string;
    stageKey: string | null;
};

export type LifecycleWorkUnitRowForSelection = {
    id: string;
    queue_definition?: unknown;
    metadata?: unknown;
};

export function listExecutableQueueKeysForWorkUnit(workUnit: {
    queue_definition?: unknown;
}): string[] {
    if (workUnit.queue_definition == null) return [];
    try {
        const bundle = loadQueueDefinitionBundle(workUnit.queue_definition);
        return bundle.normalized.queues.map((q) => q.key.trim()).filter(Boolean);
    } catch {
        return [];
    }
}

export function buildLifecycleWorkUnitPillSelection(
    workUnit: LifecycleWorkUnitRowForSelection
): ActiveLifecycleWorkUnitSelection {
    const queueKey = resolveLifecycleWorkUnitPrimaryQueueKey(workUnit) ?? "";
    return {
        workUnitId: workUnit.id,
        queueKey,
        stageKey: stageKeyFromLifecycleWorkUnitMetadata(workUnit.metadata),
    };
}

export type LifecycleQueueFetchGuardResult = {
    blocked: boolean;
    corrected: boolean;
    workUnitId: string;
    pillKey: string;
    apiQueueKey: string;
};

export function logLifecycleQueueKeyLeakGuard(detail: Record<string, unknown>): void {
    if (process.env.NODE_ENV === "production") return;
    console.error("[lifecycle-wu-queue-key-leak-guard]", detail);
}

/**
 * Before any queue rows API call: ensure queue key belongs to the target work unit's queue_definition.
 */
export function guardLifecycleQueueFetchBeforeApi(params: {
    workUnitId: string;
    attemptedQueueKey: string;
    workUnit: LifecycleWorkUnitRowForSelection | null;
    attentionBucketKey?: string;
    previousWorkUnitId?: string | null;
    previousQueueKey?: string | null;
}): LifecycleQueueFetchGuardResult {
    const workUnitId = params.workUnitId.trim();
    const attempted = params.attemptedQueueKey.trim();
    const wu = params.workUnit;
    const primary = wu ? resolveLifecycleWorkUnitPrimaryQueueKey(wu) : null;
    const validKeys = wu ? listExecutableQueueKeysForWorkUnit(wu) : [];

    if (!workUnitId) {
        return { blocked: true, corrected: false, workUnitId, pillKey: attempted, apiQueueKey: "" };
    }

    if (isLifecycleWorkUnitNavChipKey(attempted)) {
        logLifecycleQueueKeyLeakGuard({
            activeWorkUnitId: workUnitId,
            attemptedQueueKey: attempted,
            validQueueKeys: validKeys,
            previousWorkUnitId: params.previousWorkUnitId ?? null,
            previousQueueKey: params.previousQueueKey ?? null,
            reason: "lifecycle_wu_nav is not an API queue key",
        });
        const pillKey = primary ?? "";
        return {
            blocked: !pillKey,
            corrected: true,
            workUnitId,
            pillKey,
            apiQueueKey: pillKey,
        };
    }

    const resolved = resolveWorkUnitFetchQueueKeyFromPill(
        attempted,
        params.attentionBucketKey ?? "",
        wu ? { queue_definition: wu.queue_definition } : undefined
    );
    let apiQueueKey = resolved.queueKey.trim();
    let pillKey = attempted;
    let corrected = false;

    if (wu?.id && wu.id !== workUnitId) {
        logLifecycleQueueKeyLeakGuard({
            activeWorkUnitId: workUnitId,
            attemptedQueueKey: attempted,
            validQueueKeys: validKeys,
            previousWorkUnitId: params.previousWorkUnitId ?? null,
            previousQueueKey: params.previousQueueKey ?? null,
            work_unit_row_id: wu.id,
            reason: "work_unit row id does not match fetch workUnitId",
        });
    }

    if (validKeys.length > 0 && apiQueueKey && !validKeys.includes(apiQueueKey)) {
        logLifecycleQueueKeyLeakGuard({
            activeWorkUnitId: workUnitId,
            attemptedQueueKey: attempted,
            resolvedApiQueueKey: apiQueueKey,
            validQueueKeys: validKeys,
            previousWorkUnitId: params.previousWorkUnitId ?? null,
            previousQueueKey: params.previousQueueKey ?? null,
            correctedTo: primary,
        });
        if (primary) {
            apiQueueKey = primary;
            pillKey = primary;
            corrected = true;
        } else {
            return { blocked: true, corrected: false, workUnitId, pillKey: attempted, apiQueueKey: "" };
        }
    }

    if (!apiQueueKey) {
        if (primary) {
            return {
                blocked: false,
                corrected: true,
                workUnitId,
                pillKey: primary,
                apiQueueKey: primary,
            };
        }
        return { blocked: true, corrected: false, workUnitId, pillKey: attempted, apiQueueKey: "" };
    }

    return { blocked: false, corrected, workUnitId, pillKey, apiQueueKey };
}

/** True when React state and the atomic selection ref are out of sync (do not fetch). */
export function lifecycleSelectionStateMatchesRef(params: {
    stateWorkUnitId: string | null | undefined;
    stateQueueKey: string | null | undefined;
    selection: ActiveLifecycleWorkUnitSelection;
}): boolean {
    const wu = (params.stateWorkUnitId ?? "").trim();
    const q = (params.stateQueueKey ?? "").trim();
    return (
        wu === params.selection.workUnitId.trim() &&
        q === params.selection.queueKey.trim() &&
        Boolean(q)
    );
}

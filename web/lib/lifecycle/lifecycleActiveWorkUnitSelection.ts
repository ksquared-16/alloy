/**
 * Atomic lifecycle work-unit + queue-key selection — prevents previous lane keys leaking on sibling pill switch.
 */

import { loadQueueDefinitionBundle } from "@/lib/config/queueDefinitionV2Runtime";
import { WORK_UNIT_ATTENTION_BUCKET_PILL_PREFIX } from "@/lib/adminV2/routeShellPipeline/adapters/workUnit/aboveFoldTypes";
import { resolveWorkUnitFetchQueueKeyFromPill } from "@/lib/adminV2/workUnitQueueSelection";
import {
    isLifecyclePlatformNavChipKey,
    isLifecycleWorkUnitNavChipKey,
    LIFECYCLE_NEEDS_ATTENTION_PLACEHOLDER_CHIP_KEY,
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
    console.warn("[lifecycle-wu-queue-key-leak-guard]", detail);
}

/** API queue keys that are valid but not listed on a stage work unit's queue_definition. */
export function isWorkUnitVirtualApiQueueKey(queueKey: string): boolean {
    return queueKey.trim().toLowerCase() === "needs_attention";
}

/** True when hover/focus prefetch should warm rows for this pill (executable lane on current WU only). */
export function isWorkUnitQueuePillPrefetchable(params: {
    pillKey: string;
    workUnit?: { queue_definition?: unknown } | null;
}): boolean {
    const pill = params.pillKey.trim();
    if (!pill) return false;
    if (pill === LIFECYCLE_NEEDS_ATTENTION_PLACEHOLDER_CHIP_KEY) return false;
    if (isLifecycleWorkUnitNavChipKey(pill)) return false;
    if (isLifecyclePlatformNavChipKey(pill)) return false;
    if (pill.toLowerCase() === "needs_attention") return false;
    if (pill.startsWith(WORK_UNIT_ATTENTION_BUCKET_PILL_PREFIX)) return false;

    const wu = params.workUnit;
    if (!wu?.queue_definition) return false;

    const resolved = resolveWorkUnitFetchQueueKeyFromPill(pill, "", wu);
    const apiKey = resolved.queueKey.trim();
    if (!apiKey || isWorkUnitVirtualApiQueueKey(apiKey)) return false;

    const validKeys = listExecutableQueueKeysForWorkUnit(wu);
    return validKeys.length > 0 && validKeys.includes(apiKey);
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

    if (isLifecycleWorkUnitNavChipKey(attempted) || isLifecyclePlatformNavChipKey(attempted)) {
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
        if (isWorkUnitVirtualApiQueueKey(apiQueueKey)) {
            return { blocked: false, corrected: false, workUnitId, pillKey, apiQueueKey };
        }
        if (primary) {
            apiQueueKey = primary;
            pillKey = primary;
            corrected = true;
        } else {
            logLifecycleQueueKeyLeakGuard({
                activeWorkUnitId: workUnitId,
                attemptedQueueKey: attempted,
                resolvedApiQueueKey: apiQueueKey,
                validQueueKeys: validKeys,
                previousWorkUnitId: params.previousWorkUnitId ?? null,
                previousQueueKey: params.previousQueueKey ?? null,
                reason: "queue key not on work unit and no primary fallback",
            });
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

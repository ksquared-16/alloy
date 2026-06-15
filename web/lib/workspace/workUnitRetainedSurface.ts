import {
    peekWorkUnitLaneCacheEntry,
    type WorkUnitViewModelCacheContext,
    type WorkUnitViewModelCacheLaneState,
} from "@/lib/adminV2/viewModel/workUnit/workUnitViewModelSessionCache";
import { ADMINV2_UI_SESSION_CACHE_TTL_MS } from "@/lib/adminV2/runtime/adminV2UiSessionCacheTtl";
import {
    putQueueRowCache,
    type QueueRowClientCacheBucket,
} from "@/lib/workspace/queueRowClientCache";
import {
    touchCachedQueueItemsForPill,
    type WorkUnitQueueItemsPayload,
} from "@/lib/workspace/workUnitQueueLaneDisplay";

export type WorkUnitWarmLaneRestoreArgs = {
    cache: Map<string, QueueRowClientCacheBucket<WorkUnitQueueItemsPayload>>;
    viewScopeFingerprint: string;
    workUnitId: string;
    pillKey: string;
    attentionBucketKey: string;
    unmappedOnly: boolean;
    queueDefinition?: unknown;
    laneContext: WorkUnitViewModelCacheContext;
};

/** Restore lane rows from in-memory client cache or session lane cache on warm work-unit return. */
export function restoreWarmWorkUnitLaneRows(
    args: WorkUnitWarmLaneRestoreArgs
): WorkUnitQueueItemsPayload | null {
    const fromClient = touchCachedQueueItemsForPill({
        cache: args.cache,
        viewScopeFingerprint: args.viewScopeFingerprint,
        workUnitId: args.workUnitId,
        pillKey: args.pillKey,
        attentionBucketKey: args.attentionBucketKey,
        unmappedOnly: args.unmappedOnly,
        queueDefinition: args.queueDefinition,
    });
    if (fromClient) return fromClient;

    const laneState: WorkUnitViewModelCacheLaneState = {
        selectedQueueKey: args.pillKey,
        attentionBucketKey: args.attentionBucketKey || null,
        laneUnmappedOnly: args.unmappedOnly,
        recordFilterFingerprint: "_",
    };
    const laneHit = peekWorkUnitLaneCacheEntry({
        context: args.laneContext,
        lane: laneState,
        maxAgeMs: ADMINV2_UI_SESSION_CACHE_TTL_MS,
    });
    if (!laneHit?.queuePayload) return null;

    const apiQueueKey = String(
        (laneHit.queuePayload.queue as { key?: string } | undefined)?.key ?? args.pillKey
    ).trim();
    if (!apiQueueKey) return null;

    const abSnap =
        apiQueueKey.trim().toLowerCase() === "needs_attention"
            ? args.attentionBucketKey.trim()
            : "";
    putQueueRowCache(
        args.cache,
        args.viewScopeFingerprint,
        args.workUnitId,
        apiQueueKey,
        laneHit.queuePayload,
        abSnap
    );
    return laneHit.queuePayload;
}

/** Warm work-unit navigation should not show cold loading or reset reveal gates. */
export function isWorkUnitWarmNavigationSnapshot(args: {
    pageCacheHit: boolean;
    sameDepartment: boolean;
    sameWorkUnit: boolean;
}): boolean {
    return args.pageCacheHit && args.sameDepartment && args.sameWorkUnit;
}

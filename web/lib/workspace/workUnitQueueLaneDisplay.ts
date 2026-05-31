import { resolveWorkUnitFetchQueueKeyFromPill } from "@/lib/adminV2/workUnitQueueSelection";
import {
    peekFreshQueueRowCache,
    queueRowLogicalCacheKey,
    touchQueueRowCacheOnHit,
    type QueueRowClientCacheBucket,
} from "@/lib/workspace/queueRowClientCache";

export type WorkUnitQueueItemsPayload = {
    items?: unknown[];
    queue?: { key?: string };
    total?: number;
    total_omitted?: boolean;
};

function resolveLaneCacheLogicalKey(args: {
    viewScopeFingerprint: string;
    workUnitId: string;
    pillKey: string;
    attentionBucketKey: string;
    unmappedOnly: boolean;
    queueDefinition?: unknown;
}): string | null {
    const resolved = resolveWorkUnitFetchQueueKeyFromPill(
        args.pillKey,
        args.attentionBucketKey,
        args.queueDefinition ? { queue_definition: args.queueDefinition } : undefined
    );
    const apiQueueKey = resolved.queueKey;
    if (!apiQueueKey.trim()) return null;
    const abSnap =
        apiQueueKey.trim().toLowerCase() === "needs_attention"
            ? resolved.attentionBucketOverride !== undefined
                ? String(resolved.attentionBucketOverride ?? "").trim()
                : args.attentionBucketKey.trim()
            : "";
    return queueRowLogicalCacheKey(
        args.viewScopeFingerprint,
        args.workUnitId,
        apiQueueKey,
        args.unmappedOnly,
        abSnap
    );
}

/**
 * Read cached row payload for a pill/lane without mutating LRU order (display peek).
 */
export function peekCachedQueueItemsForPill<T extends WorkUnitQueueItemsPayload>(args: {
    cache: Map<string, QueueRowClientCacheBucket<T>>;
    viewScopeFingerprint: string;
    workUnitId: string;
    pillKey: string;
    attentionBucketKey: string;
    unmappedOnly: boolean;
    queueDefinition?: unknown;
}): T | null {
    const logicalKey = resolveLaneCacheLogicalKey(args);
    if (!logicalKey) return null;
    return peekFreshQueueRowCache(args.cache, logicalKey)?.payload ?? null;
}

/** Touch LRU and return cached row payload for a pill/lane (user-initiated switch). */
export function touchCachedQueueItemsForPill<T extends WorkUnitQueueItemsPayload>(args: {
    cache: Map<string, QueueRowClientCacheBucket<T>>;
    viewScopeFingerprint: string;
    workUnitId: string;
    pillKey: string;
    attentionBucketKey: string;
    unmappedOnly: boolean;
    queueDefinition?: unknown;
}): T | null {
    const logicalKey = resolveLaneCacheLogicalKey(args);
    if (!logicalKey) return null;
    return touchQueueRowCacheOnHit(args.cache, logicalKey)?.payload ?? null;
}

/**
 * Above-fold queue lane is "ready" when the lane has a settled or displayable row payload —
 * not only when `items.length > 0` (empty lanes and cache-backed refresh must not skeleton forever).
 */
export function resolveWorkUnitQueueLaneItemsReady(args: {
    queue_items: WorkUnitQueueItemsPayload | null;
    queue_items_loading: boolean;
    queue_items_error: string | null;
    cache_has_lane_payload: boolean;
}): boolean {
    if (args.queue_items_error) return true;
    if (args.cache_has_lane_payload) return true;
    if (args.queue_items != null) return true;
    return false;
}

/** True when we should show buffered rows during an in-flight lane fetch (not skeleton-only). */
export function resolveWorkUnitQueueTabSwitchRefreshing(args: {
    queue_items_loading: boolean;
    bootstrap_loading: boolean;
    has_work_unit: boolean;
    selected_queue_key: string | null;
    queue_items_error: string | null;
    has_buffered_rows: boolean;
    queue_items: WorkUnitQueueItemsPayload | null;
    queue_lane_mismatch: boolean;
    cache_has_lane_payload: boolean;
}): boolean {
    if (!args.queue_items_loading || args.bootstrap_loading || !args.has_work_unit) return false;
    if (!args.selected_queue_key || args.queue_items_error) return false;
    if (args.has_buffered_rows && (args.queue_items === null || args.queue_lane_mismatch)) {
        return true;
    }
    if (args.cache_has_lane_payload && (args.queue_items === null || args.queue_lane_mismatch)) {
        return true;
    }
    return false;
}

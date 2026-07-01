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

/** @deprecated Prefer `workUnitQueueLaneRevealSettled` + `resolveWorkUnitQueueLaneRevealState`. */
export function resolveWorkUnitQueueLaneItemsReady(args: {
    lane_reveal_settled: boolean;
}): boolean {
    return args.lane_reveal_settled;
}

/** Background refresh shimmer only when settled rows are already visible. */
export function resolveWorkUnitQueueRowsRefreshing(args: {
    lane_reveal_settled: boolean;
    queue_items_loading: boolean;
    bootstrap_loading: boolean;
    /** Pill switch retaining prior rows — suppress shimmer/opacity dip. */
    pill_switch_retain_rows?: boolean;
}): boolean {
    if (args.pill_switch_retain_rows) return false;
    return (
        args.lane_reveal_settled &&
        args.queue_items_loading &&
        !args.bootstrap_loading
    );
}

/** KPI pill switch: do not flip queue into skeleton/loading when retaining visible rows. */
export function shouldSuppressQueueLoadingOnPillSwitch(args: {
    user_initiated: boolean;
    retain_prior_rows: boolean;
}): boolean {
    return args.user_initiated && args.retain_prior_rows;
}

import type { WorkUnitQueueItemsWithPerf } from "@/lib/queues/QueueService";

/** Short TTL — warm pill switches and rapid re-open without stale cross-lane bleed. */
export const WORK_UNIT_QUEUE_ITEMS_SERVER_CACHE_TTL_MS = 30_000;
const MAX_ENTRIES = 128;

type CacheEntry = {
    atMs: number;
    result: WorkUnitQueueItemsWithPerf["result"];
    rowsPerf: WorkUnitQueueItemsWithPerf["rowsPerf"];
};

const cache = new Map<string, CacheEntry>();

export function buildWorkUnitQueueItemsServerCacheKey(params: {
    orgId: string;
    workUnitId: string;
    queueKey: string;
    queueScopeKey: string;
    attentionBucketKey: string | null;
    limit?: number;
    offset?: number;
    rowEnrichment: "queue_list" | "queue_reveal";
    omitTotalCount: boolean;
    countAccuracy?: string;
    workViewId?: string | null;
}): string {
    const bucket = (params.attentionBucketKey ?? "").trim() || "_";
    const limit = params.limit ?? "_";
    const offset = params.offset ?? 0;
    const count = params.countAccuracy?.trim() || "exact";
    const omit = params.omitTotalCount ? "1" : "0";
    const workView = (params.workViewId ?? "").trim() || "_";
    return [
        params.orgId,
        params.workUnitId,
        params.queueKey.trim(),
        params.queueScopeKey,
        bucket,
        String(limit),
        String(offset),
        params.rowEnrichment,
        omit,
        count,
        workView,
    ].join("\u0001");
}

export function readWorkUnitQueueItemsServerCache(
    key: string,
    nowMs: number = Date.now()
): Pick<WorkUnitQueueItemsWithPerf, "result" | "rowsPerf"> | null {
    const hit = cache.get(key);
    if (!hit) return null;
    if (nowMs - hit.atMs > WORK_UNIT_QUEUE_ITEMS_SERVER_CACHE_TTL_MS) {
        cache.delete(key);
        return null;
    }
    return { result: hit.result, rowsPerf: hit.rowsPerf };
}

export function writeWorkUnitQueueItemsServerCache(
    key: string,
    payload: Pick<WorkUnitQueueItemsWithPerf, "result" | "rowsPerf">
): void {
    cache.set(key, { atMs: Date.now(), result: payload.result, rowsPerf: payload.rowsPerf });
    if (cache.size > MAX_ENTRIES) {
        const first = cache.keys().next().value;
        if (first) cache.delete(first);
    }
}

export function clearWorkUnitQueueItemsServerCacheForTests(): void {
    cache.clear();
}

/** Drop cached queue rows for one work unit after queue-membership mutations. */
export function invalidateWorkUnitQueueItemsServerCacheForWorkUnit(orgId: string, workUnitId: string): void {
    const prefix = `${orgId}\u0001${workUnitId}\u0001`;
    for (const key of cache.keys()) {
        if (key.startsWith(prefix)) cache.delete(key);
    }
}

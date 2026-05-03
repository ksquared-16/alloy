import { perfQueueRowsClientSide } from "@/lib/perf/adminV2PerfLog";

/**
 * Client-side cache for GET /api/admin/queues/:workUnitId/:queueKey row payloads on the work-unit page.
 * Does not replace server correctness; TTL + explicit invalidation only.
 */

export const QUEUE_ROW_CLIENT_CACHE_TTL_MS = 90_000;
const STALE_REFRESH_AFTER_MS = 45_000;

export type QueueRowClientCacheBucket<TPayload> = {
    payload: TPayload;
    fetchedAt: number;
};

export type QueueRowClientCacheEvent = "hit" | "miss" | "prefetch" | "stale_refresh";

/** `${workUnitId}:${queueKey}:${unmappedOnly ? "unmapped" : "all"}` */
export function queueRowLogicalCacheKey(workUnitId: string, queueKey: string, unmappedOnly: boolean): string {
    return `${workUnitId}:${queueKey}:${unmappedOnly ? "unmapped" : "all"}`;
}

export function queueRowPrefetchLogicalKeys(workUnitId: string, queueKey: string): [string, string] {
    return [queueRowLogicalCacheKey(workUnitId, queueKey, false), queueRowLogicalCacheKey(workUnitId, queueKey, true)];
}

/** Store one network payload under both mapped/unmapped logical keys (same GET). */
export function putQueueRowCache<TPayload>(
    map: Map<string, QueueRowClientCacheBucket<TPayload>>,
    workUnitId: string,
    queueKey: string,
    payload: TPayload
): void {
    const ent: QueueRowClientCacheBucket<TPayload> = {
        payload,
        fetchedAt: Date.now(),
    };
    for (const k of queueRowPrefetchLogicalKeys(workUnitId, queueKey)) {
        map.set(k, ent);
    }
}

export function peekFreshQueueRowCache<TPayload>(
    map: Map<string, QueueRowClientCacheBucket<TPayload>>,
    logicalKey: string,
    ttlMs: number = QUEUE_ROW_CLIENT_CACHE_TTL_MS
): QueueRowClientCacheBucket<TPayload> | null {
    const e = map.get(logicalKey);
    if (!e) return null;
    if (Date.now() - e.fetchedAt > ttlMs) {
        map.delete(logicalKey);
        return null;
    }
    return e;
}

export function shouldStaleBackgroundRefresh(
    fetchedAt: number,
    ttlMs: number = QUEUE_ROW_CLIENT_CACHE_TTL_MS
): boolean {
    const age = Date.now() - fetchedAt;
    return age >= STALE_REFRESH_AFTER_MS && age < ttlMs;
}

export function deleteQueueRowCacheKeysForPrefix(map: Map<string, unknown>, workUnitIdPrefix: string): number {
    const p = `${workUnitIdPrefix}:`;
    let n = 0;
    for (const k of [...map.keys()]) {
        if (k.startsWith(p)) {
            map.delete(k);
            n++;
        }
    }
    return n;
}

export function logQueueRowClientCache(
    ev: Omit<
        {
            event: QueueRowClientCacheEvent;
            work_unit_id?: string;
            queue_key?: string;
            age_ms?: number | null;
        },
        never
    > & { age_ms?: number | null }
): void {
    if (typeof window === "undefined") return;
    const client_hit = ev.event === "hit" || ev.event === "prefetch";
    perfQueueRowsClientSide({
        event: ev.event,
        work_unit_id: ev.work_unit_id,
        queue_key: ev.queue_key,
        age_ms: ev.age_ms ?? null,
        client_cache_hit: client_hit,
    });
}

import type { WorkUnitQueueSummariesResult } from "@/lib/queues/QueueService";
import { logWuBootstrapCache } from "@/lib/workspace/wuBootstrapCacheInstrumentation";
import { wuBootstrapCacheKeyDigest } from "@/lib/workspace/workUnitQueueScopeCacheKey";

const TTL_MS = 45_000;
const MAX_ENTRIES = 96;

type CacheEntry<T> = { atMs: number; value: T };

const summariesCache = new Map<string, CacheEntry<WorkUnitQueueSummariesResult>>();
const primaryRowsCache = new Map<string, CacheEntry<{ items: unknown[]; total_omitted?: boolean }>>();

/** Must match loader `summaryMode` + `priorityBudget` (WU reveal uses priority:6). */
const WU_REVEAL_SUMMARIES_MODE = "priority:6";

function summariesKey(params: {
    orgId: string;
    workUnitId: string;
    summariesLimit: number;
    queueScopeKey: string;
}): string {
    return `sum:${params.orgId}:${params.workUnitId}:${WU_REVEAL_SUMMARIES_MODE}:${params.summariesLimit}:${params.queueScopeKey}`;
}

function primaryRowsKey(params: {
    orgId: string;
    workUnitId: string;
    queueKey: string;
    limit: number;
    attentionBucketKey: string;
    queueScopeKey: string;
    omitTotalCount: boolean;
}): string {
    const bucket = params.attentionBucketKey.trim() || "_";
    return `rows:${params.orgId}:${params.workUnitId}:${params.queueKey}:${params.limit}:${bucket}:${params.omitTotalCount ? "1" : "0"}:${params.queueScopeKey}`;
}

function read<T>(map: Map<string, CacheEntry<T>>, key: string, label: string): T | null {
    const hit = map.get(key);
    if (!hit) return null;
    if (Date.now() - hit.atMs > TTL_MS) {
        map.delete(key);
        return null;
    }
    logWuBootstrapCache("process", "hit", {
        lane: label,
        cache_key_digest: wuBootstrapCacheKeyDigest(key),
    });
    return hit.value;
}

function write<T>(map: Map<string, CacheEntry<T>>, key: string, value: T): void {
    map.set(key, { atMs: Date.now(), value });
    if (map.size > MAX_ENTRIES) {
        const first = map.keys().next().value;
        if (first) map.delete(first);
    }
}

function logLaneMiss(label: string, key: string): void {
    logWuBootstrapCache("process", "miss", {
        lane: label,
        cache_key_digest: wuBootstrapCacheKeyDigest(key),
    });
}

export function readWorkUnitQueueSummariesBootstrapCache(params: {
    orgId: string;
    workUnitId: string;
    summariesLimit: number;
    queueScopeKey: string;
}): WorkUnitQueueSummariesResult | null {
    const key = summariesKey(params);
    const hit = read(summariesCache, key, "queue_summaries");
    if (!hit) logLaneMiss("queue_summaries", key);
    return hit;
}

export function writeWorkUnitQueueSummariesBootstrapCache(
    params: {
        orgId: string;
        workUnitId: string;
        summariesLimit: number;
        queueScopeKey: string;
    },
    value: WorkUnitQueueSummariesResult
): void {
    write(summariesCache, summariesKey(params), value);
}

export function readWorkUnitPrimaryLaneRowsBootstrapCache(params: {
    orgId: string;
    workUnitId: string;
    queueKey: string;
    limit: number;
    attentionBucketKey: string;
    queueScopeKey: string;
    omitTotalCount: boolean;
}): { items: unknown[]; total_omitted?: boolean } | null {
    const key = primaryRowsKey(params);
    const hit = read(primaryRowsCache, key, "primary_lane_rows");
    if (!hit) logLaneMiss("primary_lane_rows", key);
    return hit;
}

export function writeWorkUnitPrimaryLaneRowsBootstrapCache(
    params: {
        orgId: string;
        workUnitId: string;
        queueKey: string;
        limit: number;
        attentionBucketKey: string;
        queueScopeKey: string;
        omitTotalCount: boolean;
    },
    value: { items: unknown[]; total_omitted?: boolean }
): void {
    write(primaryRowsCache, primaryRowsKey(params), value);
}

export function resetWorkUnitOperBootstrapLaneCacheForTests(): void {
    summariesCache.clear();
    primaryRowsCache.clear();
}

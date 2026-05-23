import type { RecordScopeConstraints } from "@/lib/admin/accessScope";
import type { WorkUnitQueueSummariesResult } from "@/lib/queues/QueueService";

const TTL_MS = 30_000;
const MAX_ENTRIES = 96;

type CacheEntry<T> = { atMs: number; value: T };

const summariesCache = new Map<string, CacheEntry<WorkUnitQueueSummariesResult>>();
const primaryRowsCache = new Map<string, CacheEntry<{ items: unknown[]; total_omitted?: boolean }>>();

function scopeFingerprint(constraints: RecordScopeConstraints | null | undefined): string {
    if (!constraints) return "all";
    try {
        return JSON.stringify(constraints);
    } catch {
        return "all";
    }
}

function summariesKey(params: {
    orgId: string;
    workUnitId: string;
    summariesLimit: number;
    recordScopeConstraints?: RecordScopeConstraints | null;
}): string {
    return `sum:${params.orgId}:${params.workUnitId}:${params.summariesLimit}:${scopeFingerprint(params.recordScopeConstraints)}`;
}

function primaryRowsKey(params: {
    orgId: string;
    workUnitId: string;
    queueKey: string;
    limit: number;
    attentionBucketKey: string;
    recordScopeConstraints?: RecordScopeConstraints | null;
}): string {
    const bucket = params.attentionBucketKey.trim() || "_";
    return `rows:${params.orgId}:${params.workUnitId}:${params.queueKey}:${params.limit}:${bucket}:${scopeFingerprint(params.recordScopeConstraints)}`;
}

function read<T>(map: Map<string, CacheEntry<T>>, key: string): T | null {
    const hit = map.get(key);
    if (!hit) return null;
    if (Date.now() - hit.atMs > TTL_MS) {
        map.delete(key);
        return null;
    }
    return hit.value;
}

function write<T>(map: Map<string, CacheEntry<T>>, key: string, value: T): void {
    map.set(key, { atMs: Date.now(), value });
    if (map.size > MAX_ENTRIES) {
        const first = map.keys().next().value;
        if (first) map.delete(first);
    }
}

export function readWorkUnitQueueSummariesBootstrapCache(params: {
    orgId: string;
    workUnitId: string;
    summariesLimit: number;
    recordScopeConstraints?: RecordScopeConstraints | null;
}): WorkUnitQueueSummariesResult | null {
    return read(summariesCache, summariesKey(params));
}

export function writeWorkUnitQueueSummariesBootstrapCache(
    params: {
        orgId: string;
        workUnitId: string;
        summariesLimit: number;
        recordScopeConstraints?: RecordScopeConstraints | null;
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
    recordScopeConstraints?: RecordScopeConstraints | null;
}): { items: unknown[]; total_omitted?: boolean } | null {
    return read(primaryRowsCache, primaryRowsKey(params));
}

export function writeWorkUnitPrimaryLaneRowsBootstrapCache(
    params: {
        orgId: string;
        workUnitId: string;
        queueKey: string;
        limit: number;
        attentionBucketKey: string;
        recordScopeConstraints?: RecordScopeConstraints | null;
    },
    value: { items: unknown[]; total_omitted?: boolean }
): void {
    write(primaryRowsCache, primaryRowsKey(params), value);
}

export function resetWorkUnitOperBootstrapLaneCacheForTests(): void {
    summariesCache.clear();
    primaryRowsCache.clear();
}

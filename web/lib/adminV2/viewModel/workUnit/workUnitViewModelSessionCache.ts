import type { WorkUnitViewModel } from "@/lib/adminV2/viewModel/workUnit/types";
import type { WorkUnitQueueItemsPayload } from "@/lib/workspace/workUnitQueueLaneDisplay";

export type WorkUnitViewModelCacheContext = {
    orgId?: string | null;
    departmentId?: string | null;
    workUnitId?: string | null;
    userId?: string | null;
    scopeFingerprint?: string | null;
};

export type WorkUnitViewModelCacheLaneState = {
    selectedQueueKey: string | null;
    attentionBucketKey?: string | null;
    laneUnmappedOnly?: boolean;
    recordFilterFingerprint?: string | null;
};

export type WorkUnitViewModelCacheEntry = {
    viewModel: WorkUnitViewModel;
    generation: string;
    lane: WorkUnitViewModelCacheLaneState;
    cachedAt: number;
};

import { ADMINV2_UI_SESSION_CACHE_TTL_MS } from "@/lib/adminV2/runtime/adminV2UiSessionCacheTtl";

const DEFAULT_TTL_MS = ADMINV2_UI_SESSION_CACHE_TTL_MS;

export type WorkUnitLaneCacheEntry = {
    queuePayload: WorkUnitQueueItemsPayload;
    lane: WorkUnitViewModelCacheLaneState;
    generation: string;
    cachedAt: number;
};

const cache = new Map<string, WorkUnitViewModelCacheEntry>();
const laneCache = new Map<string, WorkUnitLaneCacheEntry>();

function trim(value: string | null | undefined): string {
    return typeof value === "string" ? value.trim() : "";
}

export function buildWorkUnitViewModelCacheKey(params: {
    context?: WorkUnitViewModelCacheContext | null;
    lane: WorkUnitViewModelCacheLaneState;
}): string {
    const orgId = trim(params.context?.orgId) || "_";
    const deptId = trim(params.context?.departmentId) || "_";
    const wuId = trim(params.context?.workUnitId) || "_";
    const userId = trim(params.context?.userId) || "_";
    const scopeFp = trim(params.context?.scopeFingerprint) || "_";
    const queueKey = trim(params.lane.selectedQueueKey) || "_";
    const attention = trim(params.lane.attentionBucketKey) || "_";
    const unmapped = params.lane.laneUnmappedOnly ? "1" : "0";
    const filters = trim(params.lane.recordFilterFingerprint) || "_";
    return `workUnitVm:${orgId}:${deptId}:${wuId}:${userId}:${scopeFp}:${queueKey}:${attention}:${unmapped}:${filters}`;
}

export function putWorkUnitViewModelCacheEntry(
    entry: Omit<WorkUnitViewModelCacheEntry, "cachedAt"> & { cachedAt?: number },
    context?: WorkUnitViewModelCacheContext | null
): void {
    const key = buildWorkUnitViewModelCacheKey({ context, lane: entry.lane });
    cache.set(key, { ...entry, cachedAt: entry.cachedAt ?? Date.now() });
}

export function peekWorkUnitViewModelCacheEntry(params: {
    context?: WorkUnitViewModelCacheContext | null;
    lane: WorkUnitViewModelCacheLaneState;
    expectedGeneration?: string | null;
    maxAgeMs?: number;
}): WorkUnitViewModelCacheEntry | null {
    const key = buildWorkUnitViewModelCacheKey(params);
    const hit = cache.get(key);
    if (!hit) return null;
    const maxAge = params.maxAgeMs ?? DEFAULT_TTL_MS;
    if (Date.now() - hit.cachedAt > maxAge) {
        cache.delete(key);
        return null;
    }
    if (params.expectedGeneration && hit.generation !== params.expectedGeneration) {
        return null;
    }
    return hit;
}

/** Invalidate all lane entries for a work unit — e.g. after bootstrap generation bump. */
export function invalidateWorkUnitViewModelCacheForWorkUnit(params: {
    context?: WorkUnitViewModelCacheContext | null;
}): void {
    const orgId = trim(params.context?.orgId) || "_";
    const deptId = trim(params.context?.departmentId) || "_";
    const wuId = trim(params.context?.workUnitId) || "_";
    const prefix = `workUnitVm:${orgId}:${deptId}:${wuId}:`;
    for (const key of cache.keys()) {
        if (key.startsWith(prefix)) cache.delete(key);
    }
}

export function putWorkUnitLaneCacheEntry(
    entry: Omit<WorkUnitLaneCacheEntry, "cachedAt"> & { cachedAt?: number },
    context?: WorkUnitViewModelCacheContext | null
): void {
    const key = buildWorkUnitViewModelCacheKey({ context, lane: entry.lane });
    laneCache.set(key, { ...entry, cachedAt: entry.cachedAt ?? Date.now() });
}

export function peekWorkUnitLaneCacheEntry(params: {
    context?: WorkUnitViewModelCacheContext | null;
    lane: WorkUnitViewModelCacheLaneState;
    expectedGeneration?: string | null;
    maxAgeMs?: number;
}): WorkUnitLaneCacheEntry | null {
    const key = buildWorkUnitViewModelCacheKey(params);
    const hit = laneCache.get(key);
    if (!hit) return null;
    const maxAge = params.maxAgeMs ?? DEFAULT_TTL_MS;
    if (Date.now() - hit.cachedAt > maxAge) {
        laneCache.delete(key);
        return null;
    }
    if (params.expectedGeneration && hit.generation !== params.expectedGeneration) {
        return null;
    }
    return hit;
}

export function clearWorkUnitViewModelSessionCacheForTests(): void {
    cache.clear();
    laneCache.clear();
}

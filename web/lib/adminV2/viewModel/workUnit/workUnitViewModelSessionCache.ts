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
import { recordWorkspaceCacheOutcome } from "@/lib/perf/workspaceNavGraph";
import type { QueueItemsResult, QueueSummary } from "@/lib/queues/types";
import type { QueueRecordLayoutConfigV3 } from "@/lib/layout/queueRecordLayoutV3";
import type { WorkViewCanonicalLocationWorkUnitRow } from "@/lib/workspace/resolveWorkViewCanonicalLocation";
import type { ResolvedActionForClient } from "@/lib/admin/actions/types";

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

// ─────────────────────────────────────────────────────────────────────────────────────────────
// PRV2 Work Unit surface caches (Trust Closure, Commit 2)
//
// `useWorkUnitSurfaceRuntime` (the PRV2 runtime) holds its config bundle, queue rows, and lane
// summaries in component-local `useState`. The surface unmounts whenever the operator leaves a
// work-unit URL (Surface Host render takeover gates on the live path), so that state is destroyed
// and every return re-runs the config→layout→summaries→rows waterfall from scratch — the return-
// navigation reconstruction defect. These caches persist those exact pieces across the unmount,
// keyed by the same org/dept/wu/user/scope/queue/view scope as the view-model cache above, so the
// runtime can seed synchronously on mount (instant) and revalidate in the background (SWR).
//
// They store PRESENTATION projections only (never authoritative records — queue items remain
// non-authoritative previews per the record/queue system docs). Org isolation is inherent in the
// key; a bounded TTL + explicit generation/work-unit invalidation prevent unbounded staleness.

/** A cache read outcome — fresh (skip refetch) vs stale (render + revalidate) vs miss. */
export type WorkUnitSurfaceCacheRead<T> = { entry: T; fresh: boolean } | null;

/** Freshness window inside the TTL: a read newer than this skips the background revalidate. */
const CONFIG_FRESH_MS = 60_000;
const QUEUE_FRESH_MS = 15_000;
const SUMMARIES_FRESH_MS = 15_000;

/** Session-stable config bundle (dept metadata, queue definition, sibling units, row layout). */
export type WorkUnitSurfaceConfigCacheEntry = {
    deptMetadata: unknown | null;
    queueDefinition: unknown | null;
    deptWorkUnits: WorkViewCanonicalLocationWorkUnitRow[] | null;
    queueRowLayoutConfig: QueueRecordLayoutConfigV3 | null;
    queueRowSurfaceId: string;
    cachedAt: number;
};

/** Config has no lane dimension — one entry per (org, dept, wu, user, scope). */
const CONFIG_LANE: WorkUnitViewModelCacheLaneState = { selectedQueueKey: null };
const configCache = new Map<string, WorkUnitSurfaceConfigCacheEntry>();

function configCacheKey(context?: WorkUnitViewModelCacheContext | null): string {
    return buildWorkUnitViewModelCacheKey({ context, lane: CONFIG_LANE });
}

export function putWorkUnitSurfaceConfigCache(
    entry: Omit<WorkUnitSurfaceConfigCacheEntry, "cachedAt"> & { cachedAt?: number },
    context?: WorkUnitViewModelCacheContext | null
): void {
    configCache.set(configCacheKey(context), { ...entry, cachedAt: entry.cachedAt ?? Date.now() });
}

export function peekWorkUnitSurfaceConfigCache(
    context?: WorkUnitViewModelCacheContext | null,
    maxAgeMs: number = DEFAULT_TTL_MS
): WorkUnitSurfaceCacheRead<WorkUnitSurfaceConfigCacheEntry> {
    const hit = configCache.get(configCacheKey(context));
    if (!hit) {
        recordWorkspaceCacheOutcome("surface_config", "miss");
        return null;
    }
    const age = Date.now() - hit.cachedAt;
    if (age > maxAgeMs) {
        configCache.delete(configCacheKey(context));
        recordWorkspaceCacheOutcome("surface_config", "miss");
        return null;
    }
    const fresh = age < CONFIG_FRESH_MS;
    recordWorkspaceCacheOutcome("surface_config", fresh ? "hit" : "stale_hit");
    return { entry: hit, fresh };
}

/** Queue rows for one lane — the primary above-fold content on return navigation. */
export type WorkUnitSurfaceQueueCacheEntry = {
    queueResult: QueueItemsResult;
    cachedAt: number;
};

const surfaceQueueCache = new Map<string, WorkUnitSurfaceQueueCacheEntry>();

export function putWorkUnitSurfaceQueueCache(
    entry: Omit<WorkUnitSurfaceQueueCacheEntry, "cachedAt"> & { cachedAt?: number },
    context: WorkUnitViewModelCacheContext | null | undefined,
    lane: WorkUnitViewModelCacheLaneState
): void {
    const key = buildWorkUnitViewModelCacheKey({ context, lane });
    surfaceQueueCache.set(key, { ...entry, cachedAt: entry.cachedAt ?? Date.now() });
}

export function peekWorkUnitSurfaceQueueCache(params: {
    context?: WorkUnitViewModelCacheContext | null;
    lane: WorkUnitViewModelCacheLaneState;
    maxAgeMs?: number;
}): WorkUnitSurfaceCacheRead<WorkUnitSurfaceQueueCacheEntry> {
    const key = buildWorkUnitViewModelCacheKey({ context: params.context, lane: params.lane });
    const hit = surfaceQueueCache.get(key);
    if (!hit) {
        recordWorkspaceCacheOutcome("queue_rows", "miss");
        return null;
    }
    const age = Date.now() - hit.cachedAt;
    if (age > (params.maxAgeMs ?? DEFAULT_TTL_MS)) {
        surfaceQueueCache.delete(key);
        recordWorkspaceCacheOutcome("queue_rows", "miss");
        return null;
    }
    const fresh = age < QUEUE_FRESH_MS;
    recordWorkspaceCacheOutcome("queue_rows", fresh ? "hit" : "stale_hit");
    return { entry: hit, fresh };
}

/** Lane summaries (fetch-sizing heuristic) — one entry per (org, dept, wu, site). */
export type WorkUnitSurfaceSummariesCacheEntry = {
    summaries: QueueSummary[];
    cachedAt: number;
};

const summariesCache = new Map<string, WorkUnitSurfaceSummariesCacheEntry>();

/** Encodes the site filter into the lane fingerprint so summaries isolate per selected site. */
function summariesLane(selectedSiteId: string | null): WorkUnitViewModelCacheLaneState {
    return { selectedQueueKey: null, recordFilterFingerprint: `site:${selectedSiteId ?? "_"}` };
}

export function putWorkUnitSurfaceSummariesCache(
    summaries: QueueSummary[],
    context: WorkUnitViewModelCacheContext | null | undefined,
    selectedSiteId: string | null
): void {
    const key = buildWorkUnitViewModelCacheKey({ context, lane: summariesLane(selectedSiteId) });
    summariesCache.set(key, { summaries, cachedAt: Date.now() });
}

export function peekWorkUnitSurfaceSummariesCache(
    context: WorkUnitViewModelCacheContext | null | undefined,
    selectedSiteId: string | null,
    maxAgeMs: number = DEFAULT_TTL_MS
): WorkUnitSurfaceCacheRead<WorkUnitSurfaceSummariesCacheEntry> {
    const key = buildWorkUnitViewModelCacheKey({ context, lane: summariesLane(selectedSiteId) });
    const hit = summariesCache.get(key);
    if (!hit) return null;
    const age = Date.now() - hit.cachedAt;
    if (age > maxAgeMs) {
        summariesCache.delete(key);
        return null;
    }
    return { entry: hit, fresh: age < SUMMARIES_FRESH_MS };
}

/** Right Rail resolved actions — the configured action lane (org/dept/wu scoped, no lane). */
export type WorkUnitSurfaceRightRailCacheEntry = {
    actions: ResolvedActionForClient[];
    cachedAt: number;
};

const rightRailCache = new Map<string, WorkUnitSurfaceRightRailCacheEntry>();

export function putWorkUnitSurfaceRightRailCache(
    actions: ResolvedActionForClient[],
    context?: WorkUnitViewModelCacheContext | null
): void {
    rightRailCache.set(configCacheKey(context), { actions, cachedAt: Date.now() });
}

export function peekWorkUnitSurfaceRightRailCache(
    context?: WorkUnitViewModelCacheContext | null,
    maxAgeMs: number = DEFAULT_TTL_MS
): WorkUnitSurfaceCacheRead<WorkUnitSurfaceRightRailCacheEntry> {
    const hit = rightRailCache.get(configCacheKey(context));
    if (!hit) return null;
    const age = Date.now() - hit.cachedAt;
    if (age > maxAgeMs) {
        rightRailCache.delete(configCacheKey(context));
        return null;
    }
    return { entry: hit, fresh: age < CONFIG_FRESH_MS };
}

/**
 * Canonical Work View totals — the per-pill count fan-out, cached as one map so a return
 * navigation resolves every badge from memory instead of re-issuing N count requests. Keyed by the
 * host context + the totals population fingerprint (targets + site), so a different visible-view set
 * or site never reads a stale map.
 */
export type WorkUnitSurfaceTotalsCacheEntry = {
    totals: Map<string, number | null>;
    cachedAt: number;
};

const totalsCache = new Map<string, WorkUnitSurfaceTotalsCacheEntry>();

function totalsCacheKey(context: WorkUnitViewModelCacheContext | null | undefined, populationKey: string): string {
    return buildWorkUnitViewModelCacheKey({
        context,
        lane: { selectedQueueKey: null, recordFilterFingerprint: `totals:${populationKey}` },
    });
}

export function putWorkUnitSurfaceTotalsCache(
    totals: Map<string, number | null>,
    populationKey: string,
    context?: WorkUnitViewModelCacheContext | null
): void {
    totalsCache.set(totalsCacheKey(context, populationKey), { totals: new Map(totals), cachedAt: Date.now() });
}

export function peekWorkUnitSurfaceTotalsCache(params: {
    context?: WorkUnitViewModelCacheContext | null;
    populationKey: string;
    maxAgeMs?: number;
}): WorkUnitSurfaceCacheRead<WorkUnitSurfaceTotalsCacheEntry> {
    const key = totalsCacheKey(params.context, params.populationKey);
    const hit = totalsCache.get(key);
    if (!hit) return null;
    const age = Date.now() - hit.cachedAt;
    if (age > (params.maxAgeMs ?? DEFAULT_TTL_MS)) {
        totalsCache.delete(key);
        return null;
    }
    return { entry: hit, fresh: age < QUEUE_FRESH_MS };
}

/** Drop all PRV2 surface caches for a work unit — e.g. after a queue-membership mutation. */
export function invalidateWorkUnitSurfaceCachesForWorkUnit(params: {
    context?: WorkUnitViewModelCacheContext | null;
}): void {
    const orgId = trim(params.context?.orgId) || "_";
    const deptId = trim(params.context?.departmentId) || "_";
    const wuId = trim(params.context?.workUnitId) || "_";
    const prefix = `workUnitVm:${orgId}:${deptId}:${wuId}:`;
    for (const key of configCache.keys()) if (key.startsWith(prefix)) configCache.delete(key);
    for (const key of surfaceQueueCache.keys()) if (key.startsWith(prefix)) surfaceQueueCache.delete(key);
    for (const key of summariesCache.keys()) if (key.startsWith(prefix)) summariesCache.delete(key);
    for (const key of rightRailCache.keys()) if (key.startsWith(prefix)) rightRailCache.delete(key);
    for (const key of totalsCache.keys()) if (key.startsWith(prefix)) totalsCache.delete(key);
}

export function clearWorkUnitViewModelSessionCacheForTests(): void {
    cache.clear();
    laneCache.clear();
    configCache.clear();
    surfaceQueueCache.clear();
    summariesCache.clear();
    rightRailCache.clear();
    totalsCache.clear();
}

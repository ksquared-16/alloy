import type { ResolvedActionForClient } from "@/lib/admin/actions/types";
import { loadRightRailActionsBundleServer } from "@/lib/workspace/loadRightRailActionsBundleServer";

const TTL_MS = 45_000;
const MAX_ENTRIES = 64;

type CacheEntry = { atMs: number; actions: ResolvedActionForClient[] };

const cache = new Map<string, CacheEntry>();

function cacheKey(orgId: string, departmentId: string, workUnitId: string): string {
    return `${orgId}|${departmentId}|${workUnitId}`;
}

export function readRightRailActionsBundleCache(
    orgId: string,
    departmentId: string,
    workUnitId: string
): ResolvedActionForClient[] | null {
    const key = cacheKey(orgId, departmentId, workUnitId);
    const hit = cache.get(key);
    if (!hit || Date.now() - hit.atMs > TTL_MS) {
        if (hit) cache.delete(key);
        return null;
    }
    return hit.actions;
}

export function writeRightRailActionsBundleCache(
    orgId: string,
    departmentId: string,
    workUnitId: string,
    actions: ResolvedActionForClient[]
): void {
    const key = cacheKey(orgId, departmentId, workUnitId);
    cache.set(key, { atMs: Date.now(), actions });
    if (cache.size > MAX_ENTRIES) {
        const first = cache.keys().next().value;
        if (first) cache.delete(first);
    }
}

/** Cached right-rail resolve — safe: config-driven actions only, org/dept/wu scoped. */
export async function loadRightRailActionsBundleCached(params: {
    orgId: string;
    departmentId: string;
    workUnitId: string;
}): Promise<{ actions: ResolvedActionForClient[]; cache_hit: boolean; ms: number }> {
    const cached = readRightRailActionsBundleCache(params.orgId, params.departmentId, params.workUnitId);
    if (cached) {
        return { actions: cached, cache_hit: true, ms: 0 };
    }
    const t0 = Date.now();
    const actions = await loadRightRailActionsBundleServer(params);
    const ms = Date.now() - t0;
    writeRightRailActionsBundleCache(params.orgId, params.departmentId, params.workUnitId, actions);
    return { actions, cache_hit: false, ms };
}

export function resetRightRailActionsBundleCacheForTests(): void {
    cache.clear();
}

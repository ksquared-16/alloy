import { unstable_cache } from "next/cache";
import type { ResolvedActionForClient } from "@/lib/admin/actions/types";
import { loadRightRailActionsBundleServer } from "@/lib/workspace/loadRightRailActionsBundleServer";
import { logWuBootstrapCache } from "@/lib/workspace/wuBootstrapCacheInstrumentation";
import { wuBootstrapCacheKeyDigest } from "@/lib/workspace/workUnitQueueScopeCacheKey";

const PROCESS_TTL_MS = 45_000;
const NEXT_REVALIDATE_S = 45;
const MAX_ENTRIES = 64;

type CacheEntry = { atMs: number; actions: ResolvedActionForClient[] };

const globalStore = globalThis as typeof globalThis & {
    __rightRailActionsBundleCache?: Map<string, CacheEntry>;
};

function processMap(): Map<string, CacheEntry> {
    if (!globalStore.__rightRailActionsBundleCache) {
        globalStore.__rightRailActionsBundleCache = new Map();
    }
    return globalStore.__rightRailActionsBundleCache;
}

function cacheKey(orgId: string, departmentId: string, workUnitId: string): string {
    return `${orgId}|${departmentId}|${workUnitId}`;
}

/** Sync process-layer read — use on WU bootstrap route to attach rail without awaiting fetch. */
export function readRightRailActionsBundleCache(
    orgId: string,
    departmentId: string,
    workUnitId: string
): ResolvedActionForClient[] | null {
    return readProcess(cacheKey(orgId, departmentId, workUnitId));
}

function readProcess(key: string): ResolvedActionForClient[] | null {
    const hit = processMap().get(key);
    if (!hit || Date.now() - hit.atMs > PROCESS_TTL_MS) {
        if (hit) processMap().delete(key);
        return null;
    }
    logWuBootstrapCache("process", "hit", {
        lane: "right_rail_actions",
        cache_key_digest: wuBootstrapCacheKeyDigest(key),
    });
    return hit.actions;
}

function writeProcess(key: string, actions: ResolvedActionForClient[]): void {
    processMap().set(key, { atMs: Date.now(), actions });
    if (processMap().size > MAX_ENTRIES) {
        const first = processMap().keys().next().value;
        if (first) processMap().delete(first);
    }
}

function rightRailTag(orgId: string, workUnitId: string): string {
    return `wu-right-rail:${orgId.trim()}:${workUnitId.trim()}`;
}

/** Cached right-rail resolve — config-driven actions only, org/dept/wu scoped. */
export async function loadRightRailActionsBundleCached(params: {
    orgId: string;
    departmentId: string;
    workUnitId: string;
}): Promise<{ actions: ResolvedActionForClient[]; cache_hit: boolean; ms: number }> {
    const key = cacheKey(params.orgId, params.departmentId, params.workUnitId);
    const processHit = readProcess(key);
    if (processHit) {
        return { actions: processHit, cache_hit: true, ms: 0 };
    }

    const t0 = Date.now();
    const fetcher = async () => {
        logWuBootstrapCache("next_data", "miss", {
            lane: "right_rail_actions",
            cache_key_digest: wuBootstrapCacheKeyDigest(key),
            reason: "fetch",
        });
        return loadRightRailActionsBundleServer(params);
    };

    let actions: ResolvedActionForClient[];
    if (typeof unstable_cache === "function" && process.env.NODE_ENV !== "test") {
        actions = await unstable_cache(fetcher, [`wu-right-rail-v1-${key}`], {
            revalidate: NEXT_REVALIDATE_S,
            tags: [rightRailTag(params.orgId, params.workUnitId)],
        })();
    } else {
        actions = await fetcher();
    }

    const ms = Date.now() - t0;
    writeProcess(key, actions);
    if (ms < 20) {
        logWuBootstrapCache("next_data", "hit", {
            lane: "right_rail_actions",
            cache_key_digest: wuBootstrapCacheKeyDigest(key),
            resolve_ms: ms,
        });
    }
    return { actions, cache_hit: false, ms };
}

export function resetRightRailActionsBundleCacheForTests(): void {
    processMap().clear();
}

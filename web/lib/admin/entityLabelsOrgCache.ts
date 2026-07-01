import type { EntityLabelsPayload } from "@/lib/admin/entityLabelsResolve";
import { logEntityLabelsCache } from "@/lib/admin/entityLabelsCacheInstrumentation";

const TTL_MS = 5 * 60_000;
const MAX_ENTRIES = 64;

type CacheEntry = { atMs: number; payload: EntityLabelsPayload };

const cache = new Map<string, CacheEntry>();

function cacheKey(orgId: string): string {
    return `entity_labels:${orgId}`;
}

export function readEntityLabelsOrgCache(orgId: string): EntityLabelsPayload | null {
    const hit = cache.get(cacheKey(orgId));
    if (!hit) return null;
    if (Date.now() - hit.atMs > TTL_MS) {
        cache.delete(cacheKey(orgId));
        return null;
    }
    logEntityLabelsCache("hit", { layer: "process", org_id: orgId, age_ms: Date.now() - hit.atMs });
    return hit.payload;
}

export function writeEntityLabelsOrgCache(orgId: string, payload: EntityLabelsPayload): void {
    const key = cacheKey(orgId);
    cache.set(key, { atMs: Date.now(), payload });
    if (cache.size > MAX_ENTRIES) {
        const first = cache.keys().next().value;
        if (first) cache.delete(first);
    }
}

export function invalidateEntityLabelsOrgCache(orgId: string): void {
    cache.delete(cacheKey(orgId));
    logEntityLabelsCache("miss", { layer: "process", reason: "invalidate", org_id: orgId });
}

export function resetEntityLabelsOrgCacheForTests(): void {
    cache.clear();
}

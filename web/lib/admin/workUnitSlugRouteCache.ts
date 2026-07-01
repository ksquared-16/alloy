import type { WorkUnitSlugRouteValue } from "@/contexts/WorkUnitSlugRouteContext";
import { workUnitRouteSlugToKey } from "@/lib/admin/workUnitRouteSlug";

export type WorkUnitSlugRouteCacheEntry = Omit<WorkUnitSlugRouteValue, "routeRecordId">;

const cache = new Map<string, WorkUnitSlugRouteCacheEntry>();

function cacheKey(workUnitSlug: string): string {
    return workUnitRouteSlugToKey(workUnitSlug.trim()) || workUnitSlug.trim();
}

export function peekWorkUnitSlugRouteCache(workUnitSlug: string): WorkUnitSlugRouteCacheEntry | null {
    const key = cacheKey(workUnitSlug);
    if (!key) return null;
    return cache.get(key) ?? null;
}

export function putWorkUnitSlugRouteCache(
    workUnitSlug: string,
    entry: WorkUnitSlugRouteCacheEntry,
): void {
    const key = cacheKey(workUnitSlug);
    if (!key) return;
    cache.set(key, entry);
}

/** @internal */
export function clearWorkUnitSlugRouteCacheForTests(): void {
    cache.clear();
}

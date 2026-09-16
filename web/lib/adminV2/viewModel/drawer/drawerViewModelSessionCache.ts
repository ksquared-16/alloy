import type { AdminDrawerEntityType } from "@/contexts/AdminDrawerContext";
import { ADMINV2_UI_SESSION_CACHE_TTL_MS } from "@/lib/adminV2/runtime/adminV2UiSessionCacheTtl";
import type { ChildDrawerOpenPreload } from "@/lib/adminV2/viewModel/drawer/child/buildChildDrawerOpenPreloadFromViewModel";
import type { OpportunityDrawerOpenPreload } from "@/lib/admin/opportunityDrawerOpenCoordinator";
import type { PersonDrawerOpenPreload } from "@/lib/adminV2/viewModel/drawer/person/buildPersonDrawerOpenPreloadFromViewModel";

export type DrawerViewModelCacheSurface =
    | "opportunity"
    | "person:parent"
    | "person:generic"
    | "child";

export type DrawerViewModelCacheContext = {
    orgId?: string | null;
    departmentId?: string | null;
    workUnitId?: string | null;
    /**
     * THE SUBJECT OF ATTENTION — part of the cache identity, not decoration.
     *
     * One family record viewed under Child A is not the same operational answer as the same record
     * under Child B: the settled frame now projects child-scoped truth, so reusing A's view model
     * for B would attribute one child's data to another. Keying on the record alone is how that
     * would happen silently.
     */
    attentionSubjectId?: string | null;
};

export type DrawerViewModelCacheEntry =
    | {
          entityType: "opportunities";
          entityId: string;
          surface: "opportunity";
          preload: OpportunityDrawerOpenPreload;
          generation: string | null;
          cachedAt: number;
      }
    | {
          entityType: "persons";
          entityId: string;
          surface: "person:parent" | "person:generic" | "child";
          preload: PersonDrawerOpenPreload | ChildDrawerOpenPreload;
          generation: string | null;
          cachedAt: number;
      };

const DEFAULT_TTL_MS = ADMINV2_UI_SESSION_CACHE_TTL_MS;

/** Optional shell pin — header/tabs/first_paint flags for instant reopen without recompose. */
export type DrawerShellPinSnapshot = {
    entityType: AdminDrawerEntityType;
    entityId: string;
    surface: DrawerViewModelCacheSurface;
    /** VM generation when snapshot was captured — background refresh when stale. */
    generation: string | null;
    firstPaintSettled: boolean;
    cachedAt: number;
};

const cache = new Map<string, DrawerViewModelCacheEntry>();
const shellPinCache = new Map<string, DrawerShellPinSnapshot>();

function trim(value: string | null | undefined): string {
    return typeof value === "string" ? value.trim() : "";
}

export function buildDrawerViewModelCacheKey(params: {
    entityType: AdminDrawerEntityType;
    entityId: string;
    surface: DrawerViewModelCacheSurface;
    context?: DrawerViewModelCacheContext | null;
}): string {
    const orgId = trim(params.context?.orgId) || "_";
    const deptId = trim(params.context?.departmentId) || "_";
    const wuId = trim(params.context?.workUnitId) || "_";
    const attention = trim(params.context?.attentionSubjectId) || "_";
    return `drawerVm:${params.entityType}:${params.entityId.trim()}:${params.surface}:${orgId}:${deptId}:${wuId}:${attention}`;
}

export function putDrawerViewModelCacheEntry(entry: DrawerViewModelCacheEntry, context?: DrawerViewModelCacheContext | null): void {
    const key = buildDrawerViewModelCacheKey({
        entityType: entry.entityType,
        entityId: entry.entityId,
        surface: entry.surface,
        context,
    });
    cache.set(key, entry);
}

export function peekDrawerViewModelCacheEntry(params: {
    entityType: AdminDrawerEntityType;
    entityId: string;
    surface: DrawerViewModelCacheSurface;
    context?: DrawerViewModelCacheContext | null;
    maxAgeMs?: number;
}): DrawerViewModelCacheEntry | null {
    const key = buildDrawerViewModelCacheKey(params);
    const hit = cache.get(key);
    if (!hit) return null;
    const maxAge = params.maxAgeMs ?? DEFAULT_TTL_MS;
    if (Date.now() - hit.cachedAt > maxAge) {
        cache.delete(key);
        return null;
    }
    return hit;
}

/** True when another scoped cache entry exists for the same entity id + surface. */
export function drawerViewModelCacheEntryExistsForOtherScope(
    entityType: AdminDrawerEntityType,
    entityId: string,
    surface: DrawerViewModelCacheSurface,
    expectedKey: string
): boolean {
    const id = entityId.trim();
    if (!id) return false;
    for (const [key, entry] of cache.entries()) {
        if (entry.entityType !== entityType) continue;
        if (entry.entityId.trim() !== id) continue;
        if (entry.surface !== surface) continue;
        if (key === expectedKey) continue;
        return true;
    }
    return false;
}

/** True when another scoped cache entry exists for the same opportunity entity id. */
export function opportunityDrawerVmCacheEntryExistsForOtherScope(
    opportunityId: string,
    expectedKey: string
): boolean {
    return drawerViewModelCacheEntryExistsForOtherScope(
        "opportunities",
        opportunityId,
        "opportunity",
        expectedKey
    );
}

export function clearDrawerViewModelSessionCacheForTests(): void {
    cache.clear();
    shellPinCache.clear();
}

export function invalidateDrawerViewModelCacheForEntity(
    entityType: AdminDrawerEntityType,
    entityId: string,
    context?: DrawerViewModelCacheContext | null,
    surface: DrawerViewModelCacheSurface = "opportunity",
): void {
    /*
     * EVERY ATTENTION VARIANT OF THIS RECORD, not only the caller's.
     *
     * The subject of attention is part of the key, so one record can hold several live entries — the
     * same family under Child A and under Child B. An invalidation names a RECORD that changed, and
     * that change is equally true for every child it was viewed under. Deleting only the caller's
     * exact key would leave the other children serving the pre-mutation answer, which is precisely
     * the staleness this cache exists to avoid.
     *
     * Attention is the LAST key segment, so the scope prefix is the key with it removed. The trailing
     * separator is kept, so a work-unit id can never prefix-match a longer one.
     */
    const exact = buildDrawerViewModelCacheKey({
        entityType,
        entityId: entityId.trim(),
        surface,
        context: { ...(context ?? {}), attentionSubjectId: null },
    });
    const scopePrefix = exact.slice(0, -1);
    for (const key of [...cache.keys()]) if (key.startsWith(scopePrefix)) cache.delete(key);
    for (const key of [...shellPinCache.keys()]) if (key.startsWith(scopePrefix)) shellPinCache.delete(key);
}

export function putDrawerShellPinSnapshot(
    snapshot: Omit<DrawerShellPinSnapshot, "cachedAt"> & { cachedAt?: number },
    context?: DrawerViewModelCacheContext | null
): void {
    const key = buildDrawerViewModelCacheKey({
        entityType: snapshot.entityType,
        entityId: snapshot.entityId,
        surface: snapshot.surface,
        context,
    });
    shellPinCache.set(key, { ...snapshot, cachedAt: snapshot.cachedAt ?? Date.now() });
}

export function peekDrawerShellPinSnapshot(params: {
    entityType: AdminDrawerEntityType;
    entityId: string;
    surface: DrawerViewModelCacheSurface;
    context?: DrawerViewModelCacheContext | null;
    maxAgeMs?: number;
}): DrawerShellPinSnapshot | null {
    const key = buildDrawerViewModelCacheKey(params);
    const hit = shellPinCache.get(key);
    if (!hit) return null;
    const maxAge = params.maxAgeMs ?? DEFAULT_TTL_MS;
    if (Date.now() - hit.cachedAt > maxAge) {
        shellPinCache.delete(key);
        return null;
    }
    return hit;
}

export function resolvePersonDrawerViewModelSurface(params: {
    openSource?: string | null;
    presentationEmphasis?: string | null;
}): DrawerViewModelCacheSurface {
    if (
        params.openSource === "opportunity_inquiry_child" ||
        params.presentationEmphasis === "child_lifecycle"
    ) {
        return "child";
    }
    if (params.openSource === "opportunity_primary_contact" || params.openSource === "queue_row_person") {
        return "person:parent";
    }
    return "person:generic";
}

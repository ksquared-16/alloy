import type { AdminDrawerEntityType } from "@/contexts/AdminDrawerContext";
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

const DEFAULT_TTL_MS = 5 * 60 * 1000;

const cache = new Map<string, DrawerViewModelCacheEntry>();

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
    return `drawerVm:${params.entityType}:${params.entityId.trim()}:${params.surface}:${orgId}:${deptId}:${wuId}`;
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

export function clearDrawerViewModelSessionCacheForTests(): void {
    cache.clear();
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

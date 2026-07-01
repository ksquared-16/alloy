import type { PersonPrefetchSource } from "@/lib/admin/prefetchPersonDrawerSnapshot";
import { perfDevDetailEnabled, perfDrawer, perfPrefetch } from "@/lib/perf/perfNamespaceLog";

export function logPersonPrefetch(payload: {
    personId: string;
    source: PersonPrefetchSource;
    cacheHit: boolean;
    durationMs: number;
}): void {
    if (!perfDevDetailEnabled()) return;
    perfPrefetch("person_drawer", {
        entity_type: "person",
        entity_id: payload.personId,
        source: payload.source,
        cache_hit: payload.cacheHit,
        duration_ms: payload.durationMs,
    });
}

export function logPersonDrawerOpen(payload: {
    personId: string;
    cacheHit: boolean;
    timeToVisibleMs: number;
    source?: string | null;
}): void {
    if (!perfDevDetailEnabled()) return;
    perfDrawer("open_visible", {
        entity_type: "person",
        entity_id: payload.personId,
        cache_hit: payload.cacheHit,
        duration_ms: payload.timeToVisibleMs,
        warm: payload.cacheHit,
        cold: !payload.cacheHit,
        source: payload.source ?? (payload.cacheHit ? "cache" : "network"),
    });
}

export function logDrawerBackRestore(payload: {
    opportunityId: string;
    restoredFromSnapshot: boolean;
    timeToVisibleMs: number;
}): void {
    if (!perfDevDetailEnabled()) return;
    perfDrawer("linked_swap_commit", {
        entity_type: "opportunity",
        entity_id: payload.opportunityId,
        cache_hit: payload.restoredFromSnapshot,
        duration_ms: payload.timeToVisibleMs,
        source: payload.restoredFromSnapshot ? "cache" : "network",
    });
}

export function logDrawerTabSwitch(payload: {
    entityType: string;
    entityId: string;
    fromTab: string;
    toTab: string;
    durationMs?: number;
}): void {
    perfDrawer("tab_switch", {
        entity_type: payload.entityType,
        entity_id: payload.entityId,
        tab: payload.toTab,
        duration_ms: payload.durationMs,
        source: "ui",
    });
}

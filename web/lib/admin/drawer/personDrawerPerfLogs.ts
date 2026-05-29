import type { PersonPrefetchSource } from "@/lib/admin/prefetchPersonDrawerSnapshot";

const PERF_ENABLED = process.env.NODE_ENV === "development" || process.env.VITEST === "true";

export function logPersonPrefetch(payload: {
    personId: string;
    source: PersonPrefetchSource;
    cacheHit: boolean;
    durationMs: number;
}): void {
    if (!PERF_ENABLED) return;
    console.info("[person-prefetch]", payload);
}

export function logPersonDrawerOpen(payload: {
    personId: string;
    cacheHit: boolean;
    timeToVisibleMs: number;
    source?: string | null;
}): void {
    if (!PERF_ENABLED) return;
    console.info("[person-drawer-open]", payload);
}

export function logDrawerBackRestore(payload: {
    opportunityId: string;
    restoredFromSnapshot: boolean;
    timeToVisibleMs: number;
}): void {
    if (!PERF_ENABLED) return;
    console.info("[drawer-back-restore]", payload);
}

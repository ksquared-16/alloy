/**
 * OIP workspace warm cache — background fetch + stale-while-revalidate for workspace, work unit, and analytics modal.
 */
import { fetchOipMetricsResolved } from "@/lib/kpi/oipBridge";
import type { ResolvedMetricMap } from "@/lib/metrics/fetchResolvedMetrics";
import type { OipMetricKey } from "@/lib/metrics/types";
import { listAvailableMetricPacks } from "@/lib/metrics/packs";
import { runWhenAdminV2PrimarySurfaceReady } from "@/lib/workspace/adminV2DeferBackgroundWork";

const CACHE_TTL_MS = 90_000;

export type OipWarmScope = {
    siteId: string | null;
    workUnitId?: string | null;
    keys: readonly OipMetricKey[];
};

type OipWarmEntry = {
    scopeKey: string;
    resolved: ResolvedMetricMap;
    fetchedAt: number;
    error: string | null;
};

const entries = new Map<string, OipWarmEntry>();
const inflight = new Map<string, Promise<ResolvedMetricMap>>();
let warmScheduled = false;
const listeners = new Set<() => void>();

function notify(): void {
    listeners.forEach((l) => l());
}

export function buildOipWarmScopeKey(scope: OipWarmScope): string {
    const keys = [...scope.keys].sort().join(",");
    return `${scope.siteId ?? "all"}:${scope.workUnitId ?? "org"}:${keys}`;
}

function isFresh(entry: OipWarmEntry | undefined): entry is OipWarmEntry {
    return Boolean(entry && Date.now() - entry.fetchedAt < CACHE_TTL_MS);
}

export function getOipWarmSnapshot(scopeKey: string): ResolvedMetricMap | null {
    const entry = entries.get(scopeKey);
    return isFresh(entry) ? entry.resolved : null;
}

/** Reuse freshest org/site warm entry when exact key scope differs (e.g. workspace vs modal key sets). */
export function getLatestOipWarmSnapshotForSite(siteId: string | null): ResolvedMetricMap | null {
    const prefix = `${siteId ?? "all"}:`;
    let best: OipWarmEntry | null = null;
    for (const entry of entries.values()) {
        if (!isFresh(entry)) continue;
        if (!entry.scopeKey.startsWith(prefix)) continue;
        if (!best || entry.fetchedAt > best.fetchedAt) best = entry;
    }
    return best?.resolved ?? null;
}

export function subscribeOipWarmCache(listener: () => void): () => void {
    listeners.add(listener);
    return () => listeners.delete(listener);
}

export function allAvailableOipMetricKeys(): OipMetricKey[] {
    return listAvailableMetricPacks().flatMap((p) => p.metricKeys) as OipMetricKey[];
}

export async function prefetchOipMetricsWarm(
    scope: OipWarmScope,
    opts?: { force?: boolean }
): Promise<ResolvedMetricMap> {
    const scopeKey = buildOipWarmScopeKey(scope);
    const cached = entries.get(scopeKey);
    if (isFresh(cached) && !opts?.force) {
        void fetchOipMetricsResolved({
            keys: [...scope.keys],
            siteId: scope.siteId,
            workUnitId: scope.workUnitId ?? null,
            window: "rolling_30d",
        })
            .then((resolved) => {
                entries.set(scopeKey, {
                    scopeKey,
                    resolved,
                    fetchedAt: Date.now(),
                    error: null,
                });
                notify();
            })
            .catch(() => {
                /* stale-while-revalidate */
            });
        return cached.resolved;
    }

    const existingInflight = inflight.get(scopeKey);
    if (existingInflight && !opts?.force) return existingInflight;

    const promise = fetchOipMetricsResolved({
        keys: [...scope.keys],
        siteId: scope.siteId,
        workUnitId: scope.workUnitId ?? null,
        window: "rolling_30d",
    })
        .then((resolved) => {
            entries.set(scopeKey, {
                scopeKey,
                resolved,
                fetchedAt: Date.now(),
                error: null,
            });
            notify();
            return resolved;
        })
        .catch((e) => {
            const message = e instanceof Error ? e.message : "Failed to warm OIP metrics";
            entries.set(scopeKey, {
                scopeKey,
                resolved: cached?.resolved ?? {},
                fetchedAt: cached?.fetchedAt ?? Date.now(),
                error: message,
            });
            notify();
            return cached?.resolved ?? {};
        })
        .finally(() => {
            inflight.delete(scopeKey);
        });

    inflight.set(scopeKey, promise);
    return promise;
}

/** Deferred warm for analytics modal datasets after primary workspace surface is ready. */
export function scheduleOipAnalyticsWarm(siteId: string | null = null): void {
    if (typeof window === "undefined" || warmScheduled) return;
    warmScheduled = true;
    runWhenAdminV2PrimarySurfaceReady(() => {
        void prefetchOipMetricsWarm({
            siteId,
            keys: allAvailableOipMetricKeys(),
        });
    }, "oip_analytics_warm");
}

/** Intent / hover / modal open — reuses in-flight warm when present. */
export function warmOipAnalyticsModal(siteId: string | null = null): Promise<ResolvedMetricMap> {
    return prefetchOipMetricsWarm({
        siteId,
        keys: allAvailableOipMetricKeys(),
    });
}

/** Test-only reset. */
export function resetOipWarmCacheForTests(): void {
    entries.clear();
    inflight.clear();
    warmScheduled = false;
    listeners.clear();
}

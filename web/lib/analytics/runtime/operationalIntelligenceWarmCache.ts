"use client";

/**
 * Operational Intelligence warm cache.
 *
 * The OI surface (`OperationalIntelligencePanel`, inside the Analytics modal) raw-fetched
 * `/api/admin/intelligence/operational` on every mount and showed a pulsing skeleton until it landed —
 * a visible load on each open. The Analytics metric tiles already have a warm cache
 * (`oipWorkspaceWarmCache`); the OI model did not.
 *
 * This gives the OI model the SAME treatment: one shared client cache keyed by scope
 * (site + window + compare) + a single in-flight request, stale-while-revalidate, warmed on Analytics
 * nav intent alongside the metric tiles, so the panel paints from cache with no skeleton. No new API,
 * no new payload — it reuses the existing endpoint and its `OperationalSurfaceModel` shape.
 */

import {
    buildOperationalIntelligenceQuery,
    type OperationalSurfaceModel,
} from "@/lib/analytics/runtime/operationalSurfaceModel";
import type { MetricTimeWindowKey } from "@/lib/metrics/types";

export type OperationalIntelligenceWarmParams = {
    siteId: string | null;
    window: MetricTimeWindowKey;
    compare: boolean;
};

export type OperationalIntelligenceWarmResult = {
    model: OperationalSurfaceModel | null;
    error: string | null;
};

type CacheEntry = { model: OperationalSurfaceModel; fetchedAt: number };

const STALE_MS = 30_000;

const cache = new Map<string, CacheEntry>();
const inflight = new Map<string, Promise<OperationalIntelligenceWarmResult>>();
const listeners = new Set<() => void>();

function notify(): void {
    listeners.forEach((listener) => listener());
}

export function operationalIntelligenceScopeKey(params: OperationalIntelligenceWarmParams): string {
    return `${params.siteId ?? ""}|${params.window}|${params.compare ? "1" : "0"}`;
}

export function getOperationalIntelligenceWarm(
    params: OperationalIntelligenceWarmParams
): OperationalSurfaceModel | null {
    return cache.get(operationalIntelligenceScopeKey(params))?.model ?? null;
}

export function subscribeOperationalIntelligenceWarm(listener: () => void): () => void {
    listeners.add(listener);
    return () => listeners.delete(listener);
}

function isStale(entry: CacheEntry): boolean {
    return Date.now() - entry.fetchedAt > STALE_MS;
}

/**
 * Fetch (or reuse) the OI model for a scope. Concurrent callers share ONE in-flight request per scope;
 * a fresh cache is reused unless `force`. Returns `{ model, error }` so the panel can surface errors.
 */
export async function warmOperationalIntelligence(
    params: OperationalIntelligenceWarmParams,
    opts?: { force?: boolean }
): Promise<OperationalIntelligenceWarmResult> {
    if (typeof window === "undefined") return { model: null, error: null };
    const key = operationalIntelligenceScopeKey(params);

    if (!opts?.force) {
        const entry = cache.get(key);
        if (entry && !isStale(entry)) return { model: entry.model, error: null };
    }

    const existing = inflight.get(key);
    if (existing) return existing;

    const promise = (async (): Promise<OperationalIntelligenceWarmResult> => {
        try {
            const qs = buildOperationalIntelligenceQuery({
                siteId: params.siteId,
                window: params.window,
                compare: params.compare,
            });
            const res = await fetch(`/api/admin/intelligence/operational?${qs}`, { credentials: "include" });
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            const model = (await res.json()) as OperationalSurfaceModel;
            cache.set(key, { model, fetchedAt: Date.now() });
            notify();
            return { model, error: null };
        } catch {
            return { model: null, error: "Unable to load operational intelligence right now." };
        } finally {
            inflight.delete(key);
        }
    })();
    inflight.set(key, promise);
    return promise;
}

/** Test-only reset of module cache state. */
export function resetOperationalIntelligenceWarmForTests(): void {
    cache.clear();
    inflight.clear();
    listeners.clear();
}

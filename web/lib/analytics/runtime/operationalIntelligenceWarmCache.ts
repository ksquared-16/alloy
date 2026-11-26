"use client";

/**
 * Operational Intelligence warm cache.
 *
 * The OI surface (`OperationalIntelligencePanel`, inside the Analytics modal) raw-fetched
 * `/api/admin/intelligence/operational` on every mount and showed a pulsing skeleton until it landed.
 * This gives the OI model a shared, deduped, warm-first cache keyed by scope (site|window|compare),
 * warmed on Analytics nav intent alongside the metric tiles, so the panel paints from cache with no
 * skeleton.
 *
 * Built on the shared `createWarmCache` Runtime primitive (see `lib/runtime/warmCache.ts`). The named
 * exports below are a thin, back-compatible facade so existing consumers are unchanged.
 */

import {
    buildOperationalIntelligenceQuery,
    type OperationalSurfaceModel,
} from "@/lib/analytics/runtime/operationalSurfaceModel";
import type { MetricTimeWindowKey } from "@/lib/metrics/types";
import { createWarmCache } from "@/lib/runtime/warmCache";

export type OperationalIntelligenceWarmParams = {
    siteId: string | null;
    window: MetricTimeWindowKey;
    compare: boolean;
};

export type OperationalIntelligenceWarmResult = {
    model: OperationalSurfaceModel | null;
    error: string | null;
};

export function operationalIntelligenceScopeKey(params: OperationalIntelligenceWarmParams): string {
    return `${params.siteId ?? ""}|${params.window}|${params.compare ? "1" : "0"}`;
}

const warmCache = createWarmCache<OperationalIntelligenceWarmParams, OperationalSurfaceModel>({
    keyOf: operationalIntelligenceScopeKey,
    staleMs: 30_000,
    errorMessage: "Unable to load operational intelligence right now.",
    fetcher: async (params) => {
        const qs = buildOperationalIntelligenceQuery({
            siteId: params.siteId,
            window: params.window,
            compare: params.compare,
        });
        const res = await fetch(`/api/admin/intelligence/operational?${qs}`, { credentials: "include" });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return (await res.json()) as OperationalSurfaceModel;
    },
});

export function getOperationalIntelligenceWarm(
    params: OperationalIntelligenceWarmParams
): OperationalSurfaceModel | null {
    return warmCache.get(params);
}

export function subscribeOperationalIntelligenceWarm(listener: () => void): () => void {
    return warmCache.subscribe(listener);
}

/**
 * Fetch (or reuse) the OI model for a scope. Concurrent callers share ONE in-flight request per scope;
 * a fresh cache is reused unless `force`. Returns `{ model, error }` so the panel can surface errors.
 */
export async function warmOperationalIntelligence(
    params: OperationalIntelligenceWarmParams,
    opts?: { force?: boolean }
): Promise<OperationalIntelligenceWarmResult> {
    const result = await warmCache.warm(params, opts);
    return { model: result.data, error: result.error };
}

/** Test-only reset of module cache state. */
export function resetOperationalIntelligenceWarmForTests(): void {
    warmCache.reset();
}

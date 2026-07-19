"use client";

/**
 * Processing → Work → Incoming warm cache.
 *
 * Processing previously paid a full cold network cost on every modal open: the KPI strip and the queue
 * list each fetched `GET /api/admin/processing/queue` independently on mount. This gives Processing one
 * shared client cache + single in-flight request (KPI strip and queue list dedupe), warmed on nav
 * intent / open so the surface paints instantly from cache.
 *
 * Built on the shared `createWarmCache` Runtime primitive (`lib/runtime/warmCache.ts`) — a singleton
 * scope (one global queue). The named exports below are a thin, back-compatible facade so existing
 * consumers are unchanged.
 */

import type { ProcessingCaseQueueRow } from "@/lib/pos/processingCase/readModel/types";
import type { QueueRecommendationSummary } from "@/lib/pos/processingCase/recommendation/recommendationSummary";
import { createWarmCache, type WarmCacheEntryState } from "@/lib/runtime/warmCache";

export interface ProcessingQueueWarmData {
    rows: ProcessingCaseQueueRow[];
    counts: Record<string, number>;
    recommendations: Record<string, QueueRecommendationSummary>;
}

export type ProcessingQueueWarmState = WarmCacheEntryState<ProcessingQueueWarmData>;

interface QueueResponse {
    data: {
        rows: ProcessingCaseQueueRow[];
        next_cursor?: unknown;
        counts: Record<string, number>;
        recommendations?: Record<string, QueueRecommendationSummary>;
    };
}

const warmCache = createWarmCache<void, ProcessingQueueWarmData>({
    keyOf: () => "queue",
    staleMs: 20_000,
    errorMessage: "Failed to load processing queue",
    fetcher: async () => {
        const res = await fetch("/api/admin/processing/queue", { credentials: "same-origin" });
        if (!res.ok) throw new Error(`Request failed (${res.status})`);
        const body = (await res.json()) as QueueResponse;
        return {
            rows: Array.isArray(body.data?.rows) ? body.data.rows : [],
            counts: body.data?.counts ?? {},
            recommendations: body.data?.recommendations ?? {},
        };
    },
});

export function getProcessingQueueWarmSnapshot(): ProcessingQueueWarmState {
    return warmCache.getState(undefined);
}

export function subscribeProcessingQueueWarm(listener: () => void): () => void {
    return warmCache.subscribe(listener);
}

/**
 * Fetch the processing queue once and publish to the shared cache. Concurrent callers share the same
 * in-flight promise; a fresh cache is reused unless `force`.
 */
export async function warmProcessingQueueCache(opts?: { force?: boolean }): Promise<void> {
    await warmCache.warm(undefined, opts);
}

/** Test-only reset of module cache state. */
export function resetProcessingQueueWarmForTests(): void {
    warmCache.reset();
}

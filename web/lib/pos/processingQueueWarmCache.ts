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
import { processingActionableQueryStrings } from "@/lib/pos/processingActionableWork";

/**
 * The two questions this cache answers, which used to be one entry and should never have been.
 *
 * `browse`     — what the Work rail shows: a recency page across ALL statuses, completed and
 *                archived included, because the rail renders those lanes.
 * `actionable` — what Processing publishes as cross-record work awaiting an operator, defined by
 *                `PROCESSING_ACTIONABLE_STATUSES`.
 *
 * Collapsing these into one unparameterized read is what made Work Items project "the newest 25
 * cases" while believing it was projecting "the work". They are different questions with different
 * right answers, so they are different cache scopes.
 */
export type ProcessingQueueScope = "browse" | "actionable";

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

async function readQueue(queryString: string): Promise<ProcessingQueueWarmData> {
    const url = queryString ? `/api/admin/processing/queue?${queryString}` : "/api/admin/processing/queue";
    const res = await fetch(url, { credentials: "same-origin" });
    if (!res.ok) throw new Error(`Request failed (${res.status})`);
    const body = (await res.json()) as QueueResponse;
    return {
        rows: Array.isArray(body.data?.rows) ? body.data.rows : [],
        counts: body.data?.counts ?? {},
        recommendations: body.data?.recommendations ?? {},
    };
}

/**
 * The actionable cohort, read as BANDS and merged.
 *
 * One status-filtered page was not enough: on the certification tenant 139 `received` cases filled
 * a 100-row page and all six `needs_resolution` cases fell off the end, exactly as they had under
 * the unfiltered 25-row page. Reading each band on its own budget is what stops a large band from
 * starving an urgent one. `counts` are org-wide (the count query ignores the status filter), so the
 * first band's counts describe the whole tenant.
 */
async function readActionableCohort(): Promise<ProcessingQueueWarmData> {
    const bands = await Promise.all(processingActionableQueryStrings().map(readQueue));
    const byId = new Map<string, ProcessingCaseQueueRow>();
    const recommendations: Record<string, QueueRecommendationSummary> = {};
    for (const band of bands) {
        for (const row of band.rows) if (!byId.has(row.id)) byId.set(row.id, row);
        Object.assign(recommendations, band.recommendations);
    }
    return { rows: [...byId.values()], counts: bands[0]?.counts ?? {}, recommendations };
}

const warmCache = createWarmCache<ProcessingQueueScope, ProcessingQueueWarmData>({
    keyOf: (scope) => `queue:${scope}`,
    staleMs: 20_000,
    errorMessage: "Failed to load processing queue",
    fetcher: async (scope) => (scope === "actionable" ? readActionableCohort() : readQueue("")),
});

export function getProcessingQueueWarmSnapshot(scope: ProcessingQueueScope = "browse"): ProcessingQueueWarmState {
    return warmCache.getState(scope);
}

export function subscribeProcessingQueueWarm(listener: () => void): () => void {
    return warmCache.subscribe(listener);
}

/**
 * Fetch the processing queue once and publish to the shared cache. Concurrent callers share the same
 * in-flight promise; a fresh cache is reused unless `force`.
 */
export async function warmProcessingQueueCache(opts?: {
    force?: boolean;
    scope?: ProcessingQueueScope;
}): Promise<void> {
    await warmCache.warm(opts?.scope ?? "browse", { force: opts?.force });
}

/** Warm BOTH scopes — for a refresh that must reach the rail and the projected cohort together. */
export async function warmAllProcessingQueueScopes(opts?: { force?: boolean }): Promise<void> {
    await Promise.all([
        warmCache.warm("browse", { force: opts?.force }),
        warmCache.warm("actionable", { force: opts?.force }),
    ]);
}

/** Test-only reset of module cache state. */
export function resetProcessingQueueWarmForTests(): void {
    warmCache.reset();
}

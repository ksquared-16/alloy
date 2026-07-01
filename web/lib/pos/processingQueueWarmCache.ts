"use client";

/**
 * Processing → Work → Incoming warm cache.
 *
 * Processing previously paid a full cold network cost on every modal open: the KPI strip and
 * the queue list each fetched `GET /api/admin/processing/queue` independently on mount, running
 * the (heavy) server pipeline twice. This module gives Processing the same treatment Inbox and
 * Communications already have:
 *
 *   • one shared client cache + single in-flight request (KPI strip and queue list dedupe),
 *   • an idle warm pass scheduled from the AdminV2 shell (`coreSurfacePreloadRegistry`),
 *   • a warm-on-open / warm-on-hover hook so the surface paints instantly from cache.
 *
 * No new API, no new payload — it reuses the existing queue endpoint and its existing response
 * shape. Stale entries refresh quietly in place.
 */

import type {
    ProcessingCaseQueueRow,
} from "@/lib/pos/processingCase/readModel/types";
import type { QueueRecommendationSummary } from "@/lib/pos/processingCase/recommendation/recommendationSummary";

export interface ProcessingQueueWarmData {
    rows: ProcessingCaseQueueRow[];
    counts: Record<string, number>;
    recommendations: Record<string, QueueRecommendationSummary>;
}

export interface ProcessingQueueWarmState {
    data: ProcessingQueueWarmData | null;
    fetchedAt: number | null;
    error: string | null;
}

interface QueueResponse {
    data: {
        rows: ProcessingCaseQueueRow[];
        next_cursor?: unknown;
        counts: Record<string, number>;
        recommendations?: Record<string, QueueRecommendationSummary>;
    };
}

const STALE_MS = 20_000;
const WARM_LOAD_DELAY_MS = 1_800;

let warmState: ProcessingQueueWarmState = { data: null, fetchedAt: null, error: null };
let warmInflight: Promise<void> | null = null;
let warmScheduled = false;
const listeners = new Set<() => void>();

function notify(): void {
    listeners.forEach((listener) => listener());
}

export function getProcessingQueueWarmSnapshot(): ProcessingQueueWarmState {
    return warmState;
}

export function subscribeProcessingQueueWarm(listener: () => void): () => void {
    listeners.add(listener);
    return () => listeners.delete(listener);
}

function isWarmStale(state: ProcessingQueueWarmState): boolean {
    if (state.fetchedAt == null) return true;
    return Date.now() - state.fetchedAt > STALE_MS;
}

/**
 * Fetch the processing queue once and publish to the shared cache. Concurrent callers share the
 * same in-flight promise; a fresh cache is reused unless `force` is set.
 */
export async function warmProcessingQueueCache(opts?: { force?: boolean }): Promise<void> {
    if (typeof window === "undefined") return;
    if (warmInflight) return warmInflight;
    if (!opts?.force && warmState.data != null && !isWarmStale(warmState)) return;

    warmInflight = (async () => {
        try {
            const res = await fetch("/api/admin/processing/queue", { credentials: "same-origin" });
            if (!res.ok) throw new Error(`Request failed (${res.status})`);
            const body = (await res.json()) as QueueResponse;
            warmState = {
                data: {
                    rows: Array.isArray(body.data?.rows) ? body.data.rows : [],
                    counts: body.data?.counts ?? {},
                    recommendations: body.data?.recommendations ?? {},
                },
                fetchedAt: Date.now(),
                error: null,
            };
            notify();
        } catch (e) {
            const message = e instanceof Error ? e.message : "Failed to load processing queue";
            // Preserve any previously cached data so a transient refresh failure does not blank
            // an already-populated surface; only surface the error when there is nothing to show.
            warmState = {
                data: warmState.data,
                fetchedAt: warmState.fetchedAt,
                error: warmState.data == null ? message : null,
            };
            notify();
        }
    })().finally(() => {
        warmInflight = null;
    });

    return warmInflight;
}

/** Schedule a single deferred warm pass — safe to call from the AdminV2 shell on idle. */
export function scheduleProcessingQueueWarm(): void {
    if (typeof window === "undefined" || warmScheduled) return;
    warmScheduled = true;
    window.setTimeout(() => {
        void warmProcessingQueueCache();
    }, WARM_LOAD_DELAY_MS);
}

/** Test-only reset of module cache state. */
export function resetProcessingQueueWarmForTests(): void {
    warmState = { data: null, fetchedAt: null, error: null };
    warmInflight = null;
    warmScheduled = false;
    listeners.clear();
}

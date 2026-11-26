"use client";

/**
 * Processing → forms-list warm cache.
 *
 * The Processing overview reads two network sources: the queue (`processingQueueWarmCache`) and the
 * FORMS LIST. Forms had no shared cache, so every `useProcessingFormApi` consumer on the overview
 * fetched `GET /api/admin/forms` independently — the "/forms ×4" storm on open. This gives forms one
 * shared, deduped, warm-first cache, warmed on Processing nav intent alongside the queue.
 *
 * Built on the shared `createWarmCache` Runtime primitive (see `lib/runtime/warmCache.ts`) — a
 * singleton scope (one global forms list). The named exports below are a thin, back-compatible facade
 * so existing consumers are unchanged.
 */

import type { ProcessingFormRow } from "@/app/adminV2/pos/useProcessingFormApi";
import { createWarmCache, type WarmCacheEntryState } from "@/lib/runtime/warmCache";

export type ProcessingFormsWarmState = WarmCacheEntryState<ProcessingFormRow[]>;

const warmCache = createWarmCache<void, ProcessingFormRow[]>({
    keyOf: () => "forms",
    staleMs: 20_000,
    errorMessage: "Failed to load forms",
    fetcher: async () => {
        const res = await fetch("/api/admin/forms", { credentials: "same-origin" });
        if (!res.ok) throw new Error(`Request failed (${res.status})`);
        const body = (await res.json()) as { data?: ProcessingFormRow[] };
        return body.data ?? [];
    },
});

export function getProcessingFormsWarmSnapshot(): ProcessingFormsWarmState {
    return warmCache.getState(undefined);
}

/**
 * Fetch the forms list once and publish to the shared cache. Concurrent callers share ONE in-flight
 * promise; a fresh cache is reused unless `force`. Returns the list so a caller can `setForms(...)`
 * directly.
 */
export async function warmProcessingFormsCache(opts?: { force?: boolean }): Promise<ProcessingFormRow[]> {
    const result = await warmCache.warm(undefined, opts);
    return result.data ?? [];
}

/** Test-only reset of module cache state. */
export function resetProcessingFormsWarmForTests(): void {
    warmCache.reset();
}

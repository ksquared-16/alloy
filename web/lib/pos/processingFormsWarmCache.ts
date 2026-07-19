"use client";

/**
 * Processing → forms-list warm cache.
 *
 * The Processing overview reads two network sources: the queue (already warm — `processingQueueWarmCache`)
 * and the FORMS LIST. Forms had no shared cache, so every `useProcessingFormApi` consumer mounted on the
 * overview (the landing, the KPI strip, the overview-KPI hook) fetched `GET /api/admin/forms`
 * independently — the "/forms ×4" storm on open — and the list painted only after those resolved.
 *
 * This gives forms the SAME treatment the queue already has: one shared client cache + a single
 * in-flight request (all consumers dedupe), warmed on Processing nav intent alongside the queue, so the
 * surface paints from cache with no visible load. No new API, no new payload — it reuses the existing
 * `/api/admin/forms` endpoint and its `{ data }` shape. Stale entries refresh quietly in place.
 */

import type { ProcessingFormRow } from "@/app/adminV2/pos/useProcessingFormApi";

export interface ProcessingFormsWarmState {
    data: ProcessingFormRow[] | null;
    fetchedAt: number | null;
    error: string | null;
}

const STALE_MS = 20_000;

let warmState: ProcessingFormsWarmState = { data: null, fetchedAt: null, error: null };
let warmInflight: Promise<ProcessingFormRow[]> | null = null;
const listeners = new Set<() => void>();

function notify(): void {
    listeners.forEach((listener) => listener());
}

export function getProcessingFormsWarmSnapshot(): ProcessingFormsWarmState {
    return warmState;
}

export function subscribeProcessingFormsWarm(listener: () => void): () => void {
    listeners.add(listener);
    return () => listeners.delete(listener);
}

function isWarmStale(state: ProcessingFormsWarmState): boolean {
    if (state.fetchedAt == null) return true;
    return Date.now() - state.fetchedAt > STALE_MS;
}

/**
 * Fetch the forms list once and publish to the shared cache. Concurrent callers share ONE in-flight
 * promise (deduping the mount storm); a fresh cache is reused unless `force` is set. Returns the list
 * so a caller can `setForms(...)` from the resolved value without re-reading the snapshot.
 */
export async function warmProcessingFormsCache(opts?: { force?: boolean }): Promise<ProcessingFormRow[]> {
    if (typeof window === "undefined") return warmState.data ?? [];
    if (warmInflight) return warmInflight;
    if (!opts?.force && warmState.data != null && !isWarmStale(warmState)) return warmState.data;

    warmInflight = (async () => {
        try {
            const res = await fetch("/api/admin/forms", { credentials: "same-origin" });
            if (!res.ok) throw new Error(`Request failed (${res.status})`);
            const body = (await res.json()) as { data?: ProcessingFormRow[] };
            const rows = body.data ?? [];
            warmState = { data: rows, fetchedAt: Date.now(), error: null };
            notify();
            return rows;
        } catch (e) {
            const message = e instanceof Error ? e.message : "Failed to load forms";
            // Preserve any previously cached data so a transient refresh failure does not blank an
            // already-populated surface; only surface the error when there is nothing to show.
            warmState = {
                data: warmState.data,
                fetchedAt: warmState.fetchedAt,
                error: warmState.data == null ? message : null,
            };
            notify();
            return warmState.data ?? [];
        }
    })().finally(() => {
        warmInflight = null;
    });

    return warmInflight;
}

/** Test-only reset of module cache state. */
export function resetProcessingFormsWarmForTests(): void {
    warmState = { data: null, fetchedAt: null, error: null };
    warmInflight = null;
    listeners.clear();
}

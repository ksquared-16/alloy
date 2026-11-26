"use client";

/**
 * Processing case prefetch cache — makes opening a queued case instant.
 *
 * The queue rail already warms the LIST (`useProcessingQueueWarm`), but the case DETAIL and its
 * recommendation were fetched fresh on every selection, so each click paid a round trip and
 * flashed a loading state. This module warms the exact two read-only endpoints `usePosCase`
 * consumes, so a click paints from cache and revalidates in the background.
 *
 * Read-only and additive: same endpoints, same shapes, no new backend. Entries are short-lived so
 * an operator never acts on a stale case.
 */

import type { ProcessingCaseDetail } from "@/lib/pos/processingCase/readModel/types";
import type { SourceEvidence } from "@/lib/pos/processingCase/readModel/resolveSourceEvidence";
import type { RecommendationView } from "@/app/adminV2/processing/ReviewDecideCard";

export interface ProcessingCaseDetailData {
    detail: ProcessingCaseDetail;
    evidence: SourceEvidence[];
    affectedRecordTypes: string[];
}

interface CacheEntry {
    data: ProcessingCaseDetailData | null;
    rec: RecommendationView | null;
    at: number;
}

/** Short TTL — a warm paint is a head start, never a substitute for revalidation. */
const TTL_MS = 60_000;
const MAX_ENTRIES = 40;

const cache = new Map<string, CacheEntry>();
const inflight = new Map<string, Promise<void>>();

function isFresh(entry: CacheEntry | undefined): entry is CacheEntry {
    return Boolean(entry) && Date.now() - (entry as CacheEntry).at < TTL_MS;
}

function trim(): void {
    if (cache.size <= MAX_ENTRIES) return;
    const oldest = [...cache.entries()].sort((a, b) => a[1].at - b[1].at).slice(0, cache.size - MAX_ENTRIES);
    for (const [key] of oldest) cache.delete(key);
}

/** Warm cache read — null when absent or stale. */
export function readCachedProcessingCase(caseId: string | null | undefined): CacheEntry | null {
    if (!caseId) return null;
    const entry = cache.get(caseId);
    return isFresh(entry) ? entry : null;
}

/** Merge fresh values in (used by the hook after its own fetch, so later clicks stay instant). */
export function writeCachedProcessingCase(
    caseId: string,
    patch: Partial<Pick<CacheEntry, "data" | "rec">>
): void {
    const existing = cache.get(caseId);
    cache.set(caseId, {
        data: patch.data !== undefined ? patch.data : (existing?.data ?? null),
        rec: patch.rec !== undefined ? patch.rec : (existing?.rec ?? null),
        at: Date.now(),
    });
    trim();
}

export function invalidateProcessingCase(caseId: string): void {
    cache.delete(caseId);
}

/**
 * Fetch detail + recommendation into the cache. Deduped per case; already-fresh entries no-op,
 * so hovering a row repeatedly (or prefetching a visible page) costs at most one request each.
 */
export function prefetchProcessingCase(caseId: string | null | undefined): Promise<void> {
    if (!caseId) return Promise.resolve();
    if (isFresh(cache.get(caseId))) return Promise.resolve();
    const existing = inflight.get(caseId);
    if (existing) return existing;

    const run = (async () => {
        try {
            const [detailRes, recRes] = await Promise.all([
                fetch(`/api/admin/processing/cases/${caseId}`, { credentials: "same-origin" }),
                fetch(`/api/admin/processing/cases/${caseId}/recommendation`, { credentials: "same-origin" }),
            ]);
            const data = detailRes.ok
                ? ((await detailRes.json()) as { data: ProcessingCaseDetailData }).data ?? null
                : null;
            const rec = recRes.ok ? ((await recRes.json()) as { data?: RecommendationView }).data ?? null : null;
            if (data) writeCachedProcessingCase(caseId, { data, rec });
        } catch {
            /* prefetch is best-effort — the hook still fetches on select */
        } finally {
            inflight.delete(caseId);
        }
    })();

    inflight.set(caseId, run);
    return run;
}

/** Warm the first N rows of a queue so the common "open the top item" path is instant. */
export function prefetchProcessingCases(caseIds: readonly string[], limit = 6): void {
    for (const id of caseIds.slice(0, limit)) void prefetchProcessingCase(id);
}

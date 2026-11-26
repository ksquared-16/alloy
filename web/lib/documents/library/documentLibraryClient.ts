"use client";

/**
 * D4 — client access to the household document library.
 *
 * One cache entry per (record, focus). A record the operator has seen renders from its snapshot immediately on return
 * (warm switching) and revalidates in the background when older than {@link LIBRARY_STALE_MS}; concurrent readers share
 * one request. After a write the entries are invalidated, so a refresh after an upload is never served the pre-upload
 * snapshot (the legacy drawer prefetch could only hand back the stale one).
 */
import type { DocumentLibrary, LibrarySubjectRef } from "@/lib/documents/library/documentLibraryModel";

export type LibraryLoad = { ok: true; library: DocumentLibrary } | { ok: false; status: number; error: string; code: string | null };

type Entry = { at: number; value: LibraryLoad | null; inflight: Promise<LibraryLoad> | null };

export const LIBRARY_STALE_MS = 30_000;
const MAX_ENTRIES = 40;
const cache = new Map<string, Entry>();

export function documentLibraryUrl(anchor: LibrarySubjectRef, focus?: LibrarySubjectRef | null): string {
    const q = new URLSearchParams({ subject_type: anchor.subject_type, subject_id: anchor.subject_id });
    if (focus) {
        q.set("focus_type", focus.subject_type);
        q.set("focus_id", focus.subject_id);
    }
    return `/api/admin/documents/library?${q.toString()}`;
}

async function fetchLibrary(url: string): Promise<LibraryLoad> {
    try {
        const res = await fetch(url, { credentials: "include" });
        const json = (await res.json().catch(() => ({}))) as { library?: DocumentLibrary; error?: string; code?: string };
        if (!res.ok || !json.library) return { ok: false, status: res.status, error: json.error ?? `Could not load documents (${res.status})`, code: json.code ?? null };
        return { ok: true, library: json.library };
    } catch (e) {
        return { ok: false, status: 0, error: (e as Error).message || "Network error", code: null };
    }
}

/** The cached result for this record and focus, if any (successful or not). Synchronous: used for the first render. */
export function cachedDocumentLibrary(anchor: LibrarySubjectRef, focus?: LibrarySubjectRef | null): LibraryLoad | null {
    return cache.get(documentLibraryUrl(anchor, focus))?.value ?? null;
}

export function loadDocumentLibrary(
    anchor: LibrarySubjectRef,
    focus?: LibrarySubjectRef | null,
    opts: { fresh?: boolean } = {},
): Promise<LibraryLoad> {
    const url = documentLibraryUrl(anchor, focus);
    const entry = cache.get(url);
    if (entry?.inflight) return entry.inflight;
    if (!opts.fresh && entry?.value?.ok && Date.now() - entry.at < LIBRARY_STALE_MS) return Promise.resolve(entry.value);
    const inflight = fetchLibrary(url).then((value) => {
        // Only a successful read is cached for reuse; a failure is kept for display but always retried.
        cache.set(url, { at: Date.now(), value, inflight: null });
        while (cache.size > MAX_ENTRIES) cache.delete(cache.keys().next().value as string);
        return value;
    });
    cache.set(url, { at: entry?.at ?? 0, value: entry?.value ?? null, inflight });
    return inflight;
}

/** Warm the library for a record in idle time. Best-effort; never throws. */
export function prefetchDocumentLibrary(anchor: LibrarySubjectRef, focus?: LibrarySubjectRef | null): void {
    if (!anchor.subject_id) return;
    const run = () => void loadDocumentLibrary(anchor, focus).catch(() => undefined);
    const ric = (globalThis as { requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => number }).requestIdleCallback;
    if (typeof ric === "function") ric(run, { timeout: 2_000 });
    else setTimeout(run, 0);
}

/** Drop every cached library: a write may change any view of the household (owner, focus, counts). */
export function invalidateDocumentLibraries(): void {
    cache.clear();
}

/** Test seam. */
export function __resetDocumentLibraryCacheForTests(): void {
    cache.clear();
}

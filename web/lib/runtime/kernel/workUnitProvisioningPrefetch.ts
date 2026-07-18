/**
 * Provisioning-answer PREFETCH cache — removes blank time on Workspace → Work Unit navigation.
 *
 * K2's `workUnitEntryResourceClient` is the ONE round-trip on the operational critical path (~server 2.8s
 * + transport). Nothing prefetched it, so every navigation paid it in full. This module lets operator
 * INTENT (hover / focus on a work-unit tile) warm that exact answer into a short-TTL cache; K2's fetch then
 * resolves from the warm entry instead of the network — the click commits immediately.
 *
 * Correctness: the cached answer is the SAME payload K2 would fetch (same URL). Freshness is bounded by a
 * short TTL — a warm entry only serves a click within `PREFETCH_TTL_MS`; after that K2 fetches fresh. This
 * changes NO kernel semantics: K2 still performs its single Preparation round-trip; the round-trip is just
 * served from a warm cache when intent preceded it. Errors are never cached — a failed prefetch simply lets
 * K2 fetch normally.
 */
import type { ProvisioningAnswer } from "@/lib/runtime/provisioning/workUnitProvisioningAnswer";

/** How long a prefetched answer may serve a subsequent click. Hover→click is well under this. */
export const PREFETCH_TTL_MS = 15_000;

type Entry = { promise: Promise<ProvisioningAnswer>; startedAt: number };

const cache = new Map<string, Entry>();

/** Build the exact provisioning-answer URL K2 uses — shared so prefetch and fetch key identically. */
export function provisioningAnswerUrl(
    target: string,
    lens?: string | null,
    subject?: string | null,
): string {
    const q = new URLSearchParams();
    if (lens) q.set("work_view_id", lens);
    if (subject) q.set("subject_id", subject);
    const qs = q.toString();
    return `/api/admin/work-units/${encodeURIComponent(target)}/provisioning-answer${qs ? `?${qs}` : ""}`;
}

function isFresh(entry: Entry, now: number): boolean {
    return now - entry.startedAt < PREFETCH_TTL_MS;
}

/**
 * Warm the provisioning answer for a work-unit slug (default lens) on operator intent. Deduped + TTL'd:
 * one in-flight fetch per URL, re-warmed only after the TTL lapses. Best-effort and non-throwing.
 */
export function prefetchWorkUnitProvisioning(
    target: string,
    opts: { lens?: string | null; subject?: string | null; now?: number } = {},
): void {
    const slug = target.trim();
    if (!slug || typeof window === "undefined") return;
    const url = provisioningAnswerUrl(slug, opts.lens, opts.subject);
    const now = opts.now ?? Date.now();
    const existing = cache.get(url);
    if (existing && isFresh(existing, now)) return; // already warm / in-flight

    const promise = fetch(url, { headers: { accept: "application/json" }, credentials: "include" })
        .then(async (res) => {
            if (!res.ok) throw new Error(`prefetch failed HTTP ${res.status}`);
            return (await res.json()) as ProvisioningAnswer;
        })
        .catch((err) => {
            // Never cache a failure: drop the entry so K2 fetches fresh.
            if (cache.get(url)?.promise === promise) cache.delete(url);
            throw err;
        });
    cache.set(url, { promise, startedAt: now });
    // Keep the stored promise "handled" so a prefetch that is never consumed (or errors) does not surface
    // as an unhandled rejection. Consumers (K2) attach their own try/catch when they await it.
    void promise.catch(() => {});
}

/**
 * Return a FRESH prefetched answer promise for this URL, or null. Consumes the entry (a click is a
 * one-shot navigation; a later revisit re-warms), so a stale entry can never serve twice.
 */
export function consumeFreshProvisioning(
    url: string,
    now: number = Date.now(),
): Promise<ProvisioningAnswer> | null {
    const entry = cache.get(url);
    if (!entry) return null;
    cache.delete(url);
    if (!isFresh(entry, now)) return null;
    return entry.promise;
}

/**
 * Warm the provisioning answer for an operator entry HREF — derives `target` + `lens` exactly as the K1
 * gesture (`attentionTargetFromEntryHref`) will (path `/work-unit/{target}`, lens from `?work_view_id=`),
 * so the prefetch key is identical to the click's fetch for both default tiles and work-view rows.
 */
export function prefetchWorkUnitProvisioningFromHref(href: string | null | undefined): void {
    if (!href || typeof window === "undefined") return;
    try {
        const u = new URL(href, window.location.origin);
        const m = u.pathname.match(/\/work-unit\/([^/?#]+)/);
        if (!m) return;
        prefetchWorkUnitProvisioning(decodeURIComponent(m[1]), { lens: u.searchParams.get("work_view_id") });
    } catch {
        /* non-parseable href — no prefetch */
    }
}

/** @internal test seam */
export function clearProvisioningPrefetchForTests(): void {
    cache.clear();
}

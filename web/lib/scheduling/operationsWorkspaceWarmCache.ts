"use client";

/**
 * Operations workspace — warm data lifecycle.
 *
 * Operations was the one operational workspace that reloaded its ENTIRE dataset on every open:
 * measured 7, 7, 7, 7 requests across four open/close cycles, where Processing measured 3, 0, 0, 2
 * and Work Items 4, 0, 0, 0. The gap was never the shared host — `AdminV2WorkspaceBosModalShell`
 * unmounts children on close for EVERY workspace alike. Processing survives that unmount because its
 * data lives in module-scoped warm caches; Operations' lived in `useState`/`useRef` inside
 * `RosterWorkspace`, so closing the modal destroyed it. Its loaders were component-scoped rather than
 * workspace-runtime-scoped. (It even had a `weekCache` already — as a `useRef`, i.e. with exactly the
 * component's lifetime.)
 *
 * This adopts the existing platform primitive (`lib/runtime/warmCache.ts`), the same one Processing,
 * Work Items and Operational Intelligence read through. It is NOT an Operations-only parallel cache.
 *
 * TWO caches, because Operations has TWO freshness classes and `createWarmCache` carries one
 * `staleMs` per cache (Processing is likewise a queue cache plus a forms cache):
 *
 *   REFERENCE (5 min) — configuration the operating day is described IN, not the day itself:
 *     `?view=sites`, `?view=assignment_types`, `/api/admin/records/bootstrap`. Authored in Studio and
 *     changed rarely; re-reading it per open bought nothing.
 *
 *   DAY (30 s) — the commitments themselves: `?view=roster…`, `?view=assignment_roster…`. Short
 *     window because this is what an operator is actually watching, and it is what mutates.
 *
 * FRESHNESS IS NOT ONLY A TTL. A mutation must not wait out 30 s: `invalidateOperationsDay()` is the
 * seam `reloadAssignments` uses so a changed commitment re-reads immediately. Serving the day cache
 * without that seam would leave the Rooms board asserting the old plan after an action — the precise
 * failure the un-cached code avoided by clearing its ref.
 */
import { createWarmCache } from "@/lib/runtime/warmCache";

/** Scope is the request path itself — it already carries site and week. */
type PathParams = { path: string };

const keyOf = (p: PathParams) => p.path || null;

async function fetchJson(path: string): Promise<any> {
    const res = await fetch(path, {
        headers: { "content-type": "application/json" },
        credentials: "include",
    });
    return res.json().catch(() => ({}));
}

const referenceCache = createWarmCache<PathParams, any>({
    keyOf,
    fetcher: (p) => fetchJson(p.path),
    staleMs: 5 * 60_000,
    errorMessage: "Failed to load operations configuration",
});

const dayCache = createWarmCache<PathParams, any>({
    keyOf,
    fetcher: (p) => fetchJson(p.path),
    staleMs: 30_000,
    errorMessage: "Failed to load the operating day",
});

/** Reference reads: sites, assignment types, records bootstrap. */
export async function warmOperationsReference(path: string): Promise<any> {
    const { data } = await referenceCache.warm({ path });
    return data ?? {};
}

/** Operating-day reads: roster weeks and the assignment roster. */
export async function warmOperationsDay(path: string): Promise<any> {
    const { data } = await dayCache.warm({ path });
    return data ?? {};
}

/**
 * Drop every cached commitment read after a mutation, so the next read is authoritative.
 * Reference entries are deliberately NOT dropped — an assignment change does not re-author sites.
 */
export function invalidateOperationsDay(): void {
    dayCache.invalidate();
}

/**
 * Armed on nav intent (the left-nav open), so the workspace opens against warm configuration.
 * Only the site list is warmed here: every day read is keyed by a site that is not known until the
 * site list resolves, and speculatively warming a guessed site would compete with the operator's
 * actual choice.
 */
export function warmOperationsWorkspace(): void {
    void referenceCache.warm({ path: "/api/admin/scheduling?view=sites" });
}

/** Test-only. */
export function resetOperationsWorkspaceWarmForTests(): void {
    referenceCache.reset();
    dayCache.reset();
}

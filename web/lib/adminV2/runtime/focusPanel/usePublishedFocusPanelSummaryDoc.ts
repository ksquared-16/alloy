"use client";

import { createContext, createElement, useContext, useEffect, useMemo, useState, type ReactNode } from "react";

import type { LayoutDoc } from "@/lib/layout/layoutV2";
import {
    FOCUS_PANEL_SUMMARY_PUBLISHED_CHANNEL,
    FOCUS_PANEL_SUMMARY_PUBLISHED_EVENT,
} from "@/lib/adminV2/runtime/focusPanel/focusPanelSummaryLayoutService";

/**
 * Resolve the org's PUBLISHED Focus Panel Summary doc for the operator runtime.
 *
 * The APPLICABLE published variant is selected server-side by `resolveSurfaceVariant` (the ONE
 * applicability resolver — P3-A) in `/api/admin/entity-layouts/focus-panel-summary`; this module is the
 * client ADAPTER that fetches that selection and hands it to the Focus Panel tree. It is not a second
 * resolver — it never ranks or filters variants, it only carries the committed applicability context
 * (Business Process + Work View) to the resolver and caches the answer.
 *
 * Returns `null` until a published doc is loaded; the caller falls back to the code-built default, so
 * first paint is never blocked and the common case (no org customization) shows the exact same grid.
 *
 * CONTEXT (P3-B): when a `FocusPanelSummaryDocProvider` is mounted (it is, at the Focus Panel host), all
 * consumers — the grid, the pending skeleton, and the nested cards — read the SINGLE doc it resolved for
 * the committed `(businessProcessKey, workViewId)`, so a Work-View change re-resolves the composition and
 * every consumer stays coherent. Absent a provider the hook falls back to an unscoped module-cache fetch,
 * preserving the prior behavior. The per-context answer is cached (one fetch per scope per session) and
 * invalidated on the publish event.
 */

type CacheState = {
    doc: LayoutDoc | null;
    /** Published record identity this slot holds — `id` + `version` together, never version alone. */
    id: string | null;
    /** Published version this slot holds, so a publish announcing the SAME version need not refetch. */
    version: number | null;
    promise: Promise<LayoutDoc | null> | null;
    loaded: boolean;
    /** When this slot last settled — the TTL is measured from here. */
    settledAt: number;
};

/**
 * ── CONFIGURATION FRESHNESS (Slice 10 policy) ────────────────────────────────────────────────────
 *
 * This owner used to be same-tab-only with no TTL, which meant a mounted session could hold a
 * superseded layout indefinitely: another tab, another operator or a direct publish was never
 * observed. The published Queue Row surface already solved this; this brings its sibling up to the
 * same standard rather than inventing a mechanism.
 *
 *   same tab      → scoped publish event (immediate)
 *   same browser  → BroadcastChannel (immediate, best-effort)
 *   other session → 90s TTL, revalidated in the background
 *   foreground    → revalidate on return if past TTL
 *
 * 90s is not a tuning guess: it is the configuration-cache TTL this codebase already uses.
 */
const CONFIG_TTL_MS = 90_000;

/**
 * GENERATION GUARD. A response may be applied only if the generation it was issued under is still
 * current. Any invalidation bumps this, so a request that started before a publish cannot land
 * afterwards and resurrect the superseded document. Timing is never the test.
 *
 * One counter for the whole family is deliberate: a publish replaces the single document every scope
 * reads from, so there is no case where one scope's in-flight answer stays valid while another's does
 * not. The cost of being conservative here is one refetch of a request that was already in flight.
 */
let generation = 0;

export type FocusPanelSummaryDocContextValue = {
    businessProcessKey?: string | null;
    workViewId?: string | null;
    stageKey?: string | null;
    statusKey?: string | null;
};

/** One cache slot per applicability scope. Unscoped ("") is the legacy org-global slot. */
const cacheByScope = new Map<string, CacheState>();

function scopeKey(ctx: FocusPanelSummaryDocContextValue): string {
    return [ctx.businessProcessKey ?? "", ctx.workViewId ?? "", ctx.stageKey ?? "", ctx.statusKey ?? ""].join("|");
}

function slotFor(key: string): CacheState {
    let slot = cacheByScope.get(key);
    if (!slot) {
        slot = { doc: null, id: null, version: null, promise: null, loaded: false, settledAt: 0 };
        cacheByScope.set(key, slot);
    }
    return slot;
}

function currentGeneration(): number {
    return generation;
}

function isFresh(slot: CacheState, now: number): boolean {
    return slot.loaded && now - slot.settledAt < CONFIG_TTL_MS;
}

function queryFor(ctx: FocusPanelSummaryDocContextValue): string {
    const p = new URLSearchParams();
    if (ctx.businessProcessKey) p.set("businessProcessKey", ctx.businessProcessKey);
    if (ctx.workViewId) p.set("workViewId", ctx.workViewId);
    if (ctx.stageKey) p.set("stageKey", ctx.stageKey);
    if (ctx.statusKey) p.set("statusKey", ctx.statusKey);
    const q = p.toString();
    return q ? `?${q}` : "";
}

/**
 * `ok` is separate from `doc` on purpose. A failed revalidation must NOT be recorded as a successful
 * refresh: the last known published configuration stays visible, the slot keeps its old freshness so
 * the next eligible revalidation retries, and a transient config fetch failure never becomes an
 * operational surface teardown. A genuinely absent published doc (`ok` with `doc: null`) is a
 * different answer and is allowed to settle.
 */
type FetchOutcome = { ok: boolean; doc: LayoutDoc | null; id: string | null; version: number | null };

async function fetchPublishedDoc(ctx: FocusPanelSummaryDocContextValue): Promise<FetchOutcome> {
    try {
        const res = await fetch(`/api/admin/entity-layouts/focus-panel-summary${queryFor(ctx)}`);
        if (!res.ok) return { ok: false, doc: null, id: null, version: null };
        const json = (await res.json().catch(() => null)) as
            | { published?: { doc?: LayoutDoc; id?: string; version?: number } | null }
            | null;
        return {
            ok: true,
            doc: json?.published?.doc ?? null,
            id: json?.published?.id ?? null,
            version: typeof json?.published?.version === "number" ? json.published.version : null,
        };
    } catch {
        return { ok: false, doc: null, id: null, version: null };
    }
}

/** Start (or join) a load for one scope, honouring the generation guard. */
function startLoad(ctx: FocusPanelSummaryDocContextValue, key: string, slot: CacheState): Promise<LayoutDoc | null> {
    if (slot.promise) return slot.promise;
    const issuedGeneration = generation;
    slot.promise = fetchPublishedDoc(ctx).then((outcome) => {
        // THE GUARD. Anything invalidated while this was in flight makes this answer historical.
        // Dropping the promise (not the doc) lets the next read start a fresh, current request.
        if (issuedGeneration !== generation) {
            if (cacheByScope.get(key) === slot) slot.promise = null;
            return slot.doc;
        }
        slot.promise = null;
        if (!outcome.ok) {
            // Failed revalidation: keep the last known configuration and do NOT mark it refreshed.
            return slot.doc;
        }
        slot.doc = outcome.doc;
        slot.id = outcome.id;
        slot.version = outcome.version;
        slot.loaded = true;
        slot.settledAt = Date.now();
        return slot.doc;
    });
    return slot.promise;
}

function ensureLoad(ctx: FocusPanelSummaryDocContextValue): Promise<LayoutDoc | null> {
    const key = scopeKey(ctx);
    const slot = slotFor(key);
    const now = Date.now();
    if (isFresh(slot, now)) return Promise.resolve(slot.doc);
    if (slot.loaded) {
        // STALE-WHILE-REVALIDATE. The cached document stays usable and visible; the refresh happens
        // underneath it. Never blank the panel and never block subject navigation on configuration.
        void startLoad(ctx, key, slot).catch(() => {});
        return Promise.resolve(slot.doc);
    }
    return startLoad(ctx, key, slot);
}

/**
 * Invalidate on publish.
 *
 * A detail that names a version this slot already holds is a publish we have already caught up to
 * (commonly our own tab's event arriving alongside the BroadcastChannel copy) — nothing to refetch.
 * A payloadless event is the legacy caller and must keep working: it invalidates everything, which
 * is the behaviour that existed before this contract.
 */
function invalidateForPublish(detail: { version?: number | null } | null | undefined): void {
    const version = detail && typeof detail.version === "number" ? detail.version : null;
    if (version !== null) {
        let anyStale = false;
        for (const slot of cacheByScope.values()) {
            if (slot.version !== version) { anyStale = true; break; }
        }
        if (!anyStale && cacheByScope.size > 0) return; // already current — no work
    }
    invalidateAll();
}

/** Invalidate every scope (a publish replaces the one document every scope reads) and refetch. */
/**
 * The published Summary records this client currently holds, as `id:version`.
 *
 * Sent with a provisioning request so the answer can skip re-sending a document we already have. The
 * SERVER decides whether that is safe by comparing against the record IT resolved for the subject's
 * scope — this is only a claim about the client, exactly as `dept_config` is (S6-1).
 */
export function heldFocusPanelSummaryIdentities(): string[] {
    const seen = new Set<string>();
    for (const slot of cacheByScope.values()) {
        if (slot.doc != null && slot.id && typeof slot.version === "number") {
            seen.add(`${slot.id}:${slot.version}`);
        }
    }
    // Bounded: this rides a URL that is also the provisioning coalescing key.
    return [...seen].slice(0, 8);
}

/**
 * The document for one published record identity, wherever we already hold it.
 *
 * Scope selects WHICH record applies; it does not change what a record IS. So when the answer says
 * "you already hold record X v153" for a scope whose slot is empty, reusing X's document is exact
 * rather than approximate — and it is what keeps an omitted document from costing a new fetch.
 */
function heldDocForIdentity(id: string | null, version: number | null): LayoutDoc | null {
    if (!id || typeof version !== "number") return null;
    for (const slot of cacheByScope.values()) {
        if (slot.id === id && slot.version === version && slot.doc != null) return slot.doc;
    }
    return null;
}

function invalidateAll(): void {
    generation += 1;
    cacheByScope.clear();
}

/**
 * @internal test seam — the freshness contract is module-owned, so it is exercised directly rather
 * than through a rendered hook. Same convention as `clearInflightProvisioningEntriesForTests`.
 */
export const __focusPanelSummaryFreshnessTestApi = {
    reset(): void {
        generation += 1;
        cacheByScope.clear();
    },
    load(ctx: FocusPanelSummaryDocContextValue): Promise<LayoutDoc | null> {
        return ensureLoad(ctx);
    },
    invalidateForPublish(detail: { version?: number | null } | null): void {
        invalidateForPublish(detail);
    },
    peek(ctx: FocusPanelSummaryDocContextValue): CacheState | null {
        return cacheByScope.get(scopeKey(ctx)) ?? null;
    },
    scopeCount(): number {
        return cacheByScope.size;
    },
    generation(): number {
        return generation;
    },
    ttlMs: CONFIG_TTL_MS,
};

/** Load `{doc, loaded}` for one applicability scope, refreshing on the publish event. */
function usePublishedFocusPanelSummaryDocForScope(
    enabled: boolean,
    ctx: FocusPanelSummaryDocContextValue,
): { doc: LayoutDoc | null; loaded: boolean } {
    const key = scopeKey(ctx);
    const [state, setState] = useState<{ doc: LayoutDoc | null; loaded: boolean }>(() => {
        const slot = cacheByScope.get(key);
        return slot?.loaded ? { doc: slot.doc, loaded: true } : { doc: null, loaded: false };
    });

    useEffect(() => {
        if (!enabled) return;
        let active = true;
        // Reflect the current slot immediately (scope may have changed), then load.
        const slot = cacheByScope.get(key);
        setState(slot?.loaded ? { doc: slot.doc, loaded: true } : { doc: null, loaded: false });

        /*
         * APPLY IS GENERATION-GUARDED, and that is where the guard actually earns its place.
         *
         * At the CACHE level a superseded answer is already harmless: an invalidation clears the map,
         * so the in-flight response writes into an orphaned slot nothing can read. The component is
         * the part that would still be wrong — its own promise resolves to whatever that abandoned
         * request returned, and `setState` would paint it. Comparing the generation at apply time is
         * what stops a pre-publish document becoming what the operator sees, without relying on which
         * response happens to land last.
         */
        const applyIfCurrent = (issued: number) => (resolved: LayoutDoc | null) => {
            if (!active || issued !== currentGeneration()) return;
            setState({ doc: resolved, loaded: true });
        };
        const refreshAfterInvalidation = () => {
            const issued = currentGeneration();
            void ensureLoad(ctx).then(applyIfCurrent(issued));
        };
        refreshAfterInvalidation(); // initial load, under the same guard
        const onPublished = (ev: Event) => {
            invalidateForPublish((ev as CustomEvent).detail ?? null);
            refreshAfterInvalidation();
        };
        window.addEventListener(FOCUS_PANEL_SUMMARY_PUBLISHED_EVENT, onPublished);

        // SAME BROWSER, OTHER TABS. A publish elsewhere in this browser must reach this owner; the
        // sending tab closes its channel immediately after posting, so there is no echo back to it.
        let channel: BroadcastChannel | null = null;
        try {
            channel = new BroadcastChannel(FOCUS_PANEL_SUMMARY_PUBLISHED_CHANNEL);
            channel.onmessage = (msg) => {
                if ((msg?.data as { type?: string } | null)?.type !== "published") return;
                invalidateForPublish((msg.data as { version?: number | null }) ?? null);
                refreshAfterInvalidation();
            };
        } catch {
            /* unavailable — same-tab event, TTL and foreground revalidation still bound staleness */
        }

        // RETURN TO FOREGROUND. Only revalidates what has actually expired: a fresh entry is left
        // alone, and nothing is fetched while the tab is hidden merely because the TTL elapsed.
        const onVisibility = () => {
            if (document.visibilityState !== "visible") return;
            const slot = cacheByScope.get(key);
            if (!slot || isFresh(slot, Date.now())) return;
            refreshAfterInvalidation();
        };
        document.addEventListener("visibilitychange", onVisibility);

        return () => {
            active = false;
            window.removeEventListener(FOCUS_PANEL_SUMMARY_PUBLISHED_EVENT, onPublished);
            document.removeEventListener("visibilitychange", onVisibility);
            try { channel?.close(); } catch { /* already closed */ }
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [enabled, key]);

    return state;
}

// ── Provider (P3-B): resolve ONCE for the committed scope; every consumer reads this value ──────────

const FocusPanelSummaryDocContext = createContext<{ doc: LayoutDoc | null; loaded: boolean } | null>(null);

/**
 * Resolve the Focus Panel Summary doc for the committed `(businessProcessKey, workViewId)` and share it
 * with every descendant consumer (grid, skeleton, nested cards). Mount at the Focus Panel host so a
 * Work-View change re-resolves the composition coherently for the whole panel.
 */
export function FocusPanelSummaryDocProvider({
    enabled,
    businessProcessKey = null,
    workViewId = null,
    stageKey = null,
    statusKey = null,
    seed = null,
    children,
}: {
    enabled: boolean;
    businessProcessKey?: string | null;
    workViewId?: string | null;
    stageKey?: string | null;
    statusKey?: string | null;
    /**
     * COMMIT-CRITICAL SEED (A) — the published doc the provisioning answer resolved server-side for
     * the committed scope. While the client fetch for this scope has not settled, the seed IS the
     * answer (`loaded: true`), so the committed panel presents the PUBLISHED composition on its first
     * frame — no default-doc stand-in, no post-commit composition reflow. `{doc: null}` means
     * resolved-nothing-published (the code default is correct). The scope fetch still runs and, once
     * settled, replaces the seed — so a publish-event invalidation always wins over a stale seed.
     */
    seed?: { id?: string | null; version?: number | null; doc?: LayoutDoc | null } | null;
    children: ReactNode;
}) {
    const ctx = useMemo<FocusPanelSummaryDocContextValue>(
        () => ({ businessProcessKey, workViewId, stageKey, statusKey }),
        [businessProcessKey, workViewId, stageKey, statusKey],
    );
    const fetched = usePublishedFocusPanelSummaryDocForScope(enabled, ctx);
    const value = useMemo(() => {
        /*
         * S5-3. The seed may now carry IDENTITY WITHOUT A DOCUMENT, because the answer established
         * we already hold that published record. Resolving it from what we hold is the whole point:
         * treating a doc-less seed as "loaded" would render an empty Summary, and refetching it
         * would just move the 27 KB from one request to another.
         */
        const seedDoc = seed?.doc ?? heldDocForIdentity(seed?.id ?? null, seed?.version ?? null);
        // While the scope fetch is in flight, the commit-critical seed is the answer.
        if (!fetched.loaded && seedDoc != null) return { doc: seedDoc, loaded: true };
        // If the fetch settles empty but provisioning already resolved a published doc,
        // keep the seed — dropping it would strip nestedSurfaces (Household/Children)
        // and reflow composition away from the committed publish.
        if (fetched.loaded && fetched.doc == null && seedDoc != null) {
            return { doc: seedDoc, loaded: true };
        }
        return fetched;
    }, [fetched, seed]);
    return createElement(FocusPanelSummaryDocContext.Provider, { value }, children);
}

// ── Consumer hooks (unchanged API): prefer the provider's shared doc; else legacy unscoped fetch ────

export function usePublishedFocusPanelSummaryDoc(enabled: boolean): LayoutDoc | null {
    return usePublishedFocusPanelSummaryDocState(enabled).doc;
}

/**
 * Same load as {@link usePublishedFocusPanelSummaryDoc} but also reports whether the fetch has SETTLED
 * (`loaded`). The pending Focus Panel skeleton needs this: until the published doc settles it cannot know
 * whether the org uses a custom layout, so it must not commit to the code-default composition (which would
 * then reflow to the published layout on load). `loaded` true with `doc` null means "settled, no published
 * doc → use the default".
 */
export function usePublishedFocusPanelSummaryDocState(
    enabled: boolean,
): { doc: LayoutDoc | null; loaded: boolean } {
    const provided = useContext(FocusPanelSummaryDocContext);
    // Always call the fallback hook (stable hook order); ignore its result when a provider is present.
    const fallback = usePublishedFocusPanelSummaryDocForScope(enabled && provided === null, {});
    return provided ?? fallback;
}

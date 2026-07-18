"use client";

import { createContext, createElement, useContext, useEffect, useMemo, useState, type ReactNode } from "react";

import type { LayoutDoc } from "@/lib/layout/layoutV2";
import { FOCUS_PANEL_SUMMARY_PUBLISHED_EVENT } from "@/lib/adminV2/runtime/focusPanel/focusPanelSummaryLayoutService";

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
    promise: Promise<LayoutDoc | null> | null;
    loaded: boolean;
};

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
        slot = { doc: null, promise: null, loaded: false };
        cacheByScope.set(key, slot);
    }
    return slot;
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

async function fetchPublishedDoc(ctx: FocusPanelSummaryDocContextValue): Promise<LayoutDoc | null> {
    try {
        const res = await fetch(`/api/admin/entity-layouts/focus-panel-summary${queryFor(ctx)}`);
        if (!res.ok) return null;
        const json = (await res.json().catch(() => null)) as { published?: { doc?: LayoutDoc } | null } | null;
        return json?.published?.doc ?? null;
    } catch {
        return null;
    }
}

function ensureLoad(ctx: FocusPanelSummaryDocContextValue): Promise<LayoutDoc | null> {
    const key = scopeKey(ctx);
    const slot = slotFor(key);
    if (slot.loaded) return Promise.resolve(slot.doc);
    if (!slot.promise) {
        slot.promise = fetchPublishedDoc(ctx).then((doc) => {
            slot.doc = doc;
            slot.loaded = true;
            slot.promise = null;
            return doc;
        });
    }
    return slot.promise;
}

/** Invalidate every scope (a publish can change any variant) and let the next read refetch. */
function invalidateAll(): void {
    cacheByScope.clear();
}

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
        void ensureLoad(ctx).then((resolved) => {
            if (active) setState({ doc: resolved, loaded: true });
        });

        const onPublished = () => {
            invalidateAll();
            void ensureLoad(ctx).then((resolved) => {
                if (active) setState({ doc: resolved, loaded: true });
            });
        };
        window.addEventListener(FOCUS_PANEL_SUMMARY_PUBLISHED_EVENT, onPublished);
        return () => {
            active = false;
            window.removeEventListener(FOCUS_PANEL_SUMMARY_PUBLISHED_EVENT, onPublished);
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
    children,
}: {
    enabled: boolean;
    businessProcessKey?: string | null;
    workViewId?: string | null;
    stageKey?: string | null;
    statusKey?: string | null;
    children: ReactNode;
}) {
    const ctx = useMemo<FocusPanelSummaryDocContextValue>(
        () => ({ businessProcessKey, workViewId, stageKey, statusKey }),
        [businessProcessKey, workViewId, stageKey, statusKey],
    );
    const value = usePublishedFocusPanelSummaryDocForScope(enabled, ctx);
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

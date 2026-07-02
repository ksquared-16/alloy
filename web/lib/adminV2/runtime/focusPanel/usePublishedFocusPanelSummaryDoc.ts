"use client";

import { useEffect, useState } from "react";

import type { LayoutDoc } from "@/lib/layout/layoutV2";
import { FOCUS_PANEL_SUMMARY_PUBLISHED_EVENT } from "@/lib/adminV2/runtime/focusPanel/focusPanelSummaryLayoutService";

/**
 * Resolve the org's PUBLISHED Focus Panel Summary doc for the operator runtime.
 *
 * Returns `null` until a published doc is loaded; the caller falls back to the
 * code-built default, so first paint is never blocked and the common case (no
 * org customization) shows the exact same grid. When a custom layout is
 * published the hook swaps to it (sticky — never clears valid data), which is
 * the intended "see my published changes live" behavior. The result is cached at
 * module scope (one fetch per session) and refreshed on the publish event.
 */

type CacheState = {
    doc: LayoutDoc | null;
    promise: Promise<LayoutDoc | null> | null;
    loaded: boolean;
};

const cache: CacheState = { doc: null, promise: null, loaded: false };

async function fetchPublishedDoc(): Promise<LayoutDoc | null> {
    try {
        const res = await fetch("/api/admin/entity-layouts/focus-panel-summary");
        if (!res.ok) return null;
        const json = (await res.json().catch(() => null)) as { published?: { doc?: LayoutDoc } | null } | null;
        return json?.published?.doc ?? null;
    } catch {
        return null;
    }
}

function ensureLoad(): Promise<LayoutDoc | null> {
    if (cache.loaded) return Promise.resolve(cache.doc);
    if (!cache.promise) {
        cache.promise = fetchPublishedDoc().then((doc) => {
            cache.doc = doc;
            cache.loaded = true;
            cache.promise = null;
            return doc;
        });
    }
    return cache.promise;
}

/** Invalidate the module cache (e.g. after a publish) and refetch. */
function invalidate(): Promise<LayoutDoc | null> {
    cache.loaded = false;
    cache.promise = null;
    return ensureLoad();
}

export function usePublishedFocusPanelSummaryDoc(enabled: boolean): LayoutDoc | null {
    return usePublishedFocusPanelSummaryDocState(enabled).doc;
}

/**
 * Same load as {@link usePublishedFocusPanelSummaryDoc} but also reports whether the fetch
 * has SETTLED (`loaded`). The pending Focus Panel skeleton needs this: until the published
 * doc settles it cannot know whether the org uses a custom layout, so it must not commit to
 * the code-default composition (which would then reflow to the published layout on load).
 * `loaded` true with `doc` null means "settled, no published doc → use the default".
 */
export function usePublishedFocusPanelSummaryDocState(
    enabled: boolean,
): { doc: LayoutDoc | null; loaded: boolean } {
    const [state, setState] = useState<{ doc: LayoutDoc | null; loaded: boolean }>(
        cache.loaded ? { doc: cache.doc, loaded: true } : { doc: null, loaded: false },
    );

    useEffect(() => {
        if (!enabled) return;
        let active = true;
        void ensureLoad().then((resolved) => {
            if (active) setState({ doc: resolved, loaded: true });
        });

        const onPublished = () => {
            void invalidate().then((resolved) => {
                if (active) setState({ doc: resolved, loaded: true });
            });
        };
        window.addEventListener(FOCUS_PANEL_SUMMARY_PUBLISHED_EVENT, onPublished);
        return () => {
            active = false;
            window.removeEventListener(FOCUS_PANEL_SUMMARY_PUBLISHED_EVENT, onPublished);
        };
    }, [enabled]);

    return state;
}

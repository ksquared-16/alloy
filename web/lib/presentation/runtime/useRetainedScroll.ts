"use client";

/**
 * Retained scroll continuity for a scrollable surface (Workspace / Queue / Focus Panel). Attach the
 * returned ref callback to the scroll container and pass a stable `scope` string (built with
 * `queueScrollScope` / `focusPanelScrollScope` / `workspaceScrollScope`). The hook:
 *   - RESTORES the retained offset the instant the element attaches AND whenever `scope` changes on a
 *     persistent element (in-page Work View switch reuses the same scroll body) — so returning to a
 *     surface lands where the operator left it, and a NEW scope lands at its own saved offset (or top).
 *   - CAPTURES the offset continuously (rAF-throttled) so the latest position is always retained before
 *     an unmount; no capture-on-unmount needed.
 * The offset is a hint: the browser clamps `scrollTop` to current content height, so a shorter list
 * (after a mutation / permission change / deleted record) simply lands at the bottom, never invalid.
 * Retention lives in the session-scoped operator-context store (cleared on org change / logout).
 */

import { useCallback, useEffect, useRef } from "react";
import { peekRetainedScroll, putRetainedScroll } from "./workUnitOperatorContext";

export type RetainedScrollRef = (el: HTMLElement | null) => void;

export function useRetainedScroll(scope: string | null): RetainedScrollRef {
    const elRef = useRef<HTMLElement | null>(null);
    const scopeRef = useRef<string | null>(scope);
    const cleanupRef = useRef<(() => void) | null>(null);

    const restore = useCallback((el: HTMLElement | null, s: string | null) => {
        if (!el || !s) return;
        const top = peekRetainedScroll(s) ?? 0;
        el.scrollTop = top;
        // Re-apply after layout settles (retained rows may paint one frame later).
        requestAnimationFrame(() => {
            if (elRef.current === el && scopeRef.current === s) el.scrollTop = top;
        });
    }, []);

    // In-page scope change (Work View switch / record change) on a persistent element → restore the
    // new scope's offset. The prior scope's offset was already captured by the throttled listener.
    useEffect(() => {
        scopeRef.current = scope;
        restore(elRef.current, scope);
    }, [scope, restore]);

    return useCallback(
        (el: HTMLElement | null) => {
            if (elRef.current === el) return;
            cleanupRef.current?.();
            cleanupRef.current = null;
            elRef.current = el;
            if (!el) return;
            restore(el, scopeRef.current);
            let raf = 0;
            const onScroll = () => {
                const s = scopeRef.current;
                if (!s || raf) return;
                raf = requestAnimationFrame(() => {
                    raf = 0;
                    putRetainedScroll(s, el.scrollTop);
                });
            };
            el.addEventListener("scroll", onScroll, { passive: true });
            cleanupRef.current = () => {
                el.removeEventListener("scroll", onScroll);
                if (raf) cancelAnimationFrame(raf);
            };
        },
        [restore],
    );
}

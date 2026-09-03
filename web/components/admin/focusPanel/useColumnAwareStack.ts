"use client";

import { useCallback, useLayoutEffect, useMemo, useRef, useState } from "react";

import {
    resolveColumnAwareLayout,
    type ColumnAwareLayout,
} from "@/lib/adminV2/runtime/focusPanel/composition/focusPanelColumnAwareLayout";
import type { FocusPanelGridLayout } from "@/lib/adminV2/runtime/focusPanel/composition/focusPanelPublishedLayout";

/**
 * Measure the cards, then place them by the columns they occupy.
 *
 * A card's height is its content's, and its Y is the lowest bottom edge among the
 * cards it overlaps horizontally — so measurement has to happen before placement,
 * and placement has to re-run when any card resizes. One `ResizeObserver` over
 * the canvas and its cards does both.
 *
 * Shared deliberately: the composer and the published runtime resolve the same
 * authored layout through this hook, so the builder cannot preview a geometry the
 * runtime will not draw.
 */
export function useColumnAwareStack(args: {
    layout: FocusPanelGridLayout;
    gapPx: number;
    minHeightFor: (area: { rowSpan: number }) => number;
}): {
    containerRef: (node: HTMLElement | null) => void;
    registerCard: (card: string) => (node: HTMLElement | null) => void;
    resolved: ColumnAwareLayout | null;
} {
    const { layout, gapPx, minHeightFor } = args;
    const containerEl = useRef<HTMLElement | null>(null);
    const cardEls = useRef(new Map<string, HTMLElement>());
    const [width, setWidth] = useState(0);
    const [heights, setHeights] = useState<Map<string, number>>(() => new Map());

    const measure = useCallback(() => {
        const container = containerEl.current;
        if (container) {
            const next = container.clientWidth;
            setWidth((prev) => (Math.abs(prev - next) > 0.5 ? next : prev));
        }
        setHeights((prev) => {
            let changed = false;
            const next = new Map(prev);
            for (const [card, el] of cardEls.current) {
                // scrollHeight, not offsetHeight: the element is absolutely positioned
                // and sized by us, so its own box would just report back what we set.
                const measured = el.firstElementChild
                    ? (el.firstElementChild as HTMLElement).offsetHeight
                    : el.scrollHeight;
                if (Math.abs((prev.get(card) ?? -1) - measured) > 0.5) {
                    next.set(card, measured);
                    changed = true;
                }
            }
            for (const card of prev.keys()) {
                if (!cardEls.current.has(card)) { next.delete(card); changed = true; }
            }
            return changed ? next : prev;
        });
    }, []);

    const observer = useRef<ResizeObserver | null>(null);
    const ensureObserver = useCallback(() => {
        if (observer.current || typeof ResizeObserver === "undefined") return observer.current;
        observer.current = new ResizeObserver(() => measure());
        return observer.current;
    }, [measure]);

    const containerRef = useCallback((node: HTMLElement | null) => {
        const ro = ensureObserver();
        if (containerEl.current && ro) ro.unobserve(containerEl.current);
        containerEl.current = node;
        if (node && ro) ro.observe(node);
        if (node) measure();
    }, [ensureObserver, measure]);

    /*
     * ONE REF CALLBACK PER CARD, FOR THE LIFE OF THE HOOK.
     *
     * This used to return a fresh closure on every call — `registerCard(card)` inline in
     * JSX — and React detaches a ref whose IDENTITY changed: it calls the old callback
     * with `null`, then the new one with the node. Both call `measure()`, which deletes
     * the card's height and then puts it straight back, producing a NEW `heights` Map
     * with identical contents. A new object is a state change, so the component
     * re-rendered, which made another fresh closure, which detached the ref again.
     *
     * That is an unbounded render loop, and React ends it by throwing "Maximum update
     * depth exceeded" — a client-side exception that took the whole Work Unit down. It
     * only fired on the `grid` strategy, because that is the only path that mounts these
     * refs, which is why it appeared the moment an operator published a composition whose
     * columns overlap (the shape `planLanesFromGrid` cannot flatten into lanes).
     *
     * Caching by card key makes the identity stable, so React attaches each ref once and
     * detaches it only when the card genuinely leaves the layout.
     */
    const cardRefs = useRef(new Map<string, (node: HTMLElement | null) => void>());
    const registerCard = useCallback((card: string) => {
        const cached = cardRefs.current.get(card);
        if (cached) return cached;
        const ref = (node: HTMLElement | null) => {
            const ro = ensureObserver();
            const existing = cardEls.current.get(card);
            if (existing && ro) ro.unobserve(existing);
            if (node) {
                cardEls.current.set(card, node);
                // Observe the CONTENT, whose height we do not control.
                const target = (node.firstElementChild as HTMLElement | null) ?? node;
                if (ro) ro.observe(target);
            } else {
                cardEls.current.delete(card);
            }
            measure();
        };
        cardRefs.current.set(card, ref);
        return ref;
    }, [ensureObserver, measure]);

    useLayoutEffect(() => {
        measure();
        return () => {
            observer.current?.disconnect();
            observer.current = null;
        };
    }, [measure, layout]);

    const resolved = useMemo(() => {
        if (!width) return null;
        return resolveColumnAwareLayout({ layout, heights, width, gapPx, minHeightFor });
    }, [layout, heights, width, gapPx, minHeightFor]);

    return { containerRef, registerCard, resolved };
}

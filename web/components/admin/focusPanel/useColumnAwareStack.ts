"use client";

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";

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
    unmeasuredHeightFor: (area: { rowSpan: number }) => number;
    /**
     * The height the held card had at rest, from the last layout resolved before it rose.
     *
     * Skipping the measurement alone was not enough: elevating a card also reserves its
     * resting height on the cell, and that reservation lands in the same commit as the
     * elevation. The ResizeObserver can therefore read the inflated wrapper in the window
     * before the hold engages, and the layout keeps that value for as long as the card is
     * open — the panel beneath sliding down by the difference. Handing the resolver the
     * height from the last RESOLVED layout closes the race, because that value was computed
     * before anything was raised.
     */
    holdHeight?: number | null;
    /**
     * A card whose measured height must be HELD at its last resting value.
     *
     * An elevated card lifts out of its wrapper into the depth layer, so the wrapper it
     * left behind measures near zero. Believing that would collapse the card's slot and
     * slide everything beneath it upward — the underlying panel visibly reflowing the
     * instant an operator opens Add charge, and sliding back on cancel. The card is not
     * shorter; it is elsewhere. So its height is frozen for as long as it is raised.
     */
    holdCard?: string | null;
}): {
    containerRef: (node: HTMLElement | null) => void;
    registerCard: (card: string) => (node: HTMLElement | null) => void;
    resolved: ColumnAwareLayout | null;
} {
    const { layout, gapPx, unmeasuredHeightFor, holdCard = null, holdHeight = null } = args;
    // Read through a ref so `measure` stays identity-stable: it is the dependency of every
    // ref callback, and rebuilding those is what caused an unbounded render loop before.
    const holdCardRef = useRef<string | null>(holdCard);
    holdCardRef.current = holdCard;
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
                // Raised out of its wrapper — hold the resting height (see `holdCard`).
                if (card === holdCardRef.current) continue;
                /*
                 * MEASURE THE CARD, NOT THE BOX WE DREW AROUND IT.
                 *
                 * This used to read `firstElementChild.offsetHeight` while the wrapper
                 * carried a `min-height` we had just set from the previous layout — and
                 * the wrapper is a flex container whose child stretches to it. So the
                 * measurement handed back the height we imposed, and a card could only
                 * ever grow: shrink a Children roster from seventeen to two and the
                 * whitespace stayed. A measurement that reads back its own output is not
                 * a measurement.
                 *
                 * The wrapper no longer carries an imposed height, so its own box IS the
                 * content's height. `getBoundingClientRect` rather than `offsetHeight`
                 * because it is fractional — rounding every card up to a whole pixel
                 * accumulated visible drift down a long column.
                 */
                const measured = el.getBoundingClientRect().height;
                if (Math.abs((prev.get(card) ?? -1) - measured) > 0.5) {
                    next.set(card, measured);
                    changed = true;
                }
            }
            for (const card of prev.keys()) {
                if (card === holdCardRef.current) continue;
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
                /*
                 * Observe the WRAPPER, which lives as long as the card is placed.
                 *
                 * Observing `firstElementChild` meant observing whatever element the card
                 * happened to have rendered at mount. A card that swaps its subtree when
                 * data arrives — every card that loads asynchronously — replaced the
                 * observed node with one nobody was watching, and its height went stale
                 * at whatever the loading state had measured. The wrapper is not replaced,
                 * and since nothing imposes a height on it any more, its box tracks the
                 * content exactly.
                 */
                if (ro) ro.observe(node);
            } else {
                cardEls.current.delete(card);
            }
            measure();
        };
        cardRefs.current.set(card, ref);
        return ref;
    }, [ensureObserver, measure]);

    /*
     * KEEP WATCHING. THIS IS WHERE THE LAYOUT WENT STALE.
     *
     * This effect used to disconnect the ResizeObserver and null it on cleanup, and it
     * re-runs whenever `layout` changes identity. Nothing re-observed the cards afterwards:
     * `registerCard` only fires when a ref NODE changes, and the nodes had not changed. So
     * after the very first re-layout the panel had no observer at all, and every height was
     * frozen at whatever it measured in that first frame.
     *
     * Cards resolve asynchronously, so that frame is the LOADING frame. Attendance measured
     * 69px empty and settled at 139px with its timeline — and Health, stacked from the stale
     * 69px, was drawn straight through it. On screen that read as Health ignoring Attendance
     * and aligning to the right-hand column; in fact the engine had placed it correctly
     * against a height that had stopped being true.
     *
     * So re-observe everything currently registered on each pass, and disconnect only when
     * the hook itself goes away. Re-observing an element already observed is a no-op.
     */
    useLayoutEffect(() => {
        const ro = ensureObserver();
        if (ro) {
            if (containerEl.current) ro.observe(containerEl.current);
            for (const el of cardEls.current.values()) ro.observe(el);
        }
        measure();
    }, [measure, ensureObserver, layout]);

    useEffect(() => () => {
        observer.current?.disconnect();
        observer.current = null;
    }, []);

    const resolved = useMemo(() => {
        if (!width) return null;
        // A raised card keeps the slot it left, at the height it left it.
        const effective =
            holdCard && holdHeight != null
                ? new Map(heights).set(holdCard, holdHeight)
                : heights;
        return resolveColumnAwareLayout({ layout, heights: effective, width, gapPx, unmeasuredHeightFor });
    }, [layout, heights, width, gapPx, unmeasuredHeightFor, holdCard, holdHeight]);

    return { containerRef, registerCard, resolved };
}

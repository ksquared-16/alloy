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
                 * MEASURE THE CARD, NEVER THE BOX THE LAYOUT STRETCHED AROUND IT.
                 *
                 * `el` is the intrinsic node — rendered by the grid, one per area, so it
                 * outlives whatever subtree the card swaps in when its data arrives. Its
                 * PARENT is the wrapper carrying the solved band height.
                 *
                 * Reading either box as-is hands back the number this engine just imposed.
                 * That was the original defect — a card could only ever grow, so shrinking a
                 * Children roster from seventeen to two left the whitespace behind — and
                 * PR #989 reproduced it in mirror image by pinning the wrapper: a fixed box
                 * cannot report that its content outgrew it, so late-arriving content
                 * overflowed and the row beneath was drawn straight across it.
                 *
                 * So the assignment is neutralised for the read and restored in the same
                 * synchronous block. `getBoundingClientRect` forces layout, so the value is
                 * real; nothing is painted in between, so nothing flickers. With the wrapper
                 * height gone the intrinsic node's `min-height: 100%` has no definite parent
                 * to resolve against and collapses to its content — which is the truth we
                 * came for. Fractional rather than `offsetHeight`: rounding every card up to
                 * a whole pixel accumulated visible drift down a long column.
                 */
                const wrapper = el.parentElement;
                const assigned = wrapper?.style.height ?? "";
                if (wrapper && assigned) wrapper.style.height = "auto";
                const measured = el.getBoundingClientRect().height;
                if (wrapper && assigned) wrapper.style.height = assigned;
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

    /*
     * THE HALF A RESIZE OBSERVER CANNOT SEE.
     *
     * The intrinsic node carries `min-height: 100%` so the card fills its band, and that
     * floor is the one thing a ResizeObserver on it is blind to: content shrinking from
     * 325px to 200px inside a band still 325px tall changes no box, fires no callback, and
     * the band would stay open at a height nothing needs any more. Growth it does see —
     * the node exceeds the floor — which is what closes the overlap.
     *
     * So content changes are watched where they happen. `attributes: false` matters: the
     * only thing this engine writes is inline style on the WRAPPER, which is the observed
     * node's parent and outside this subtree, so `measure()` cannot trigger itself. Reads
     * are coalesced to one per frame because a card that renders a list mutates once per row.
     */
    const contentObserver = useRef<MutationObserver | null>(null);
    const contentFrame = useRef<number | null>(null);
    const ensureContentObserver = useCallback(() => {
        if (contentObserver.current || typeof MutationObserver === "undefined") return contentObserver.current;
        contentObserver.current = new MutationObserver(() => {
            if (contentFrame.current != null) return;
            contentFrame.current = requestAnimationFrame(() => {
                contentFrame.current = null;
                measure();
            });
        });
        return contentObserver.current;
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
     * refs — which, while a published grid still had a second lane reading, meant it appeared
     * the moment an operator published a composition whose columns overlap.
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
                 * Observe the INTRINSIC NODE, whose height is the card's own.
                 *
                 * This once observed `firstElementChild` — whatever element the card had
                 * rendered at mount — and a card that swapped its subtree when data arrived
                 * replaced the observed node with one nobody was watching. Moving to the
                 * wrapper fixed that and cost the truth: the wrapper is what the layout
                 * stretches, so it reported the engine's own output.
                 *
                 * The intrinsic node is neither. The grid renders it, one per authored area,
                 * so it outlives every subtree the card swaps; and the layout assigns to its
                 * parent, never to it, so its box stays the content's.
                 */
                if (ro) ro.observe(node);
                ensureContentObserver()?.observe(node, { childList: true, subtree: true, characterData: true });
            } else {
                cardEls.current.delete(card);
            }
            measure();
        };
        cardRefs.current.set(card, ref);
        return ref;
    }, [ensureObserver, ensureContentObserver, measure]);

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
        const mo = ensureContentObserver();
        if (ro) {
            if (containerEl.current) ro.observe(containerEl.current);
            for (const el of cardEls.current.values()) ro.observe(el);
        }
        // Re-observing an element already observed is a no-op for both observer kinds.
        if (mo) for (const el of cardEls.current.values()) mo.observe(el, { childList: true, subtree: true, characterData: true });
        measure();
    }, [measure, ensureObserver, ensureContentObserver, layout]);

    useEffect(() => () => {
        observer.current?.disconnect();
        observer.current = null;
        contentObserver.current?.disconnect();
        contentObserver.current = null;
        if (contentFrame.current != null) cancelAnimationFrame(contentFrame.current);
        contentFrame.current = null;
    }, []);

    const resolved = useMemo(() => {
        if (!width) return null;
        // A raised card keeps the slot it left, at the height it left it.
        const intrinsic =
            holdCard && holdHeight != null
                ? new Map(heights).set(holdCard, holdHeight)
                : heights;
        /*
         * A CARD IS AS TALL AS ITS OWN CONTENT. THE COMPOSITION DECIDES ONLY WHERE IT SITS.
         *
         * This used to run `solveRowHeights` and substitute the EQUALISED VISUAL-BAND height for
         * each card's measured one before placing it. `resolveColumnAwareLayout` was therefore
         * being handed numbers that were not measurements at all, and it dutifully placed them —
         * the engine was never wrong, it was lied to about how tall each card was.
         *
         * The cost, measured on deployed `d0870c58c` at 1440 (see the card-format doctrine §6):
         *
         *     business_process   content 227px   drawn 402px   (+175px, because Financials is tall)
         *     health_safety      content 178px   drawn 419px   (+241px, matching a card it shares
         *                                                       NO COLUMN with)
         *
         * Health spans columns 1-3 and was inflated to the height of a card in columns 9-12. That
         * is the whole argument against cross-column equalisation: on a canvas where operators
         * compose arbitrary spans, "the row" is not a thing the operator authored, and making
         * unrelated cards agree on a bottom edge manufactures emptiness nobody asked for.
         *
         * So the measured height goes straight through. Vertical position still comes from the
         * same engine, which already places a card below only those cards whose COLUMNS it
         * overlaps — that part was always right and is untouched.
         *
         * The measurement contract from the vertical-rhythm work is kept, not reverted: `measure`
         * still reads the intrinsic node with the wrapper's height neutralised. It matters even
         * more now, because the height it reports is the height that gets drawn.
         */
        return resolveColumnAwareLayout({ layout, heights: intrinsic, width, gapPx, unmeasuredHeightFor });
    }, [layout, heights, width, gapPx, unmeasuredHeightFor, holdCard, holdHeight]);

    return { containerRef, registerCard, resolved };
}

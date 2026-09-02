"use client";

import {
    useCallback,
    useEffect,
    useLayoutEffect,
    useMemo,
    useRef,
    useState,
    type PointerEvent,
    type ReactNode,
} from "react";
import { GripVertical, Plus, X } from "lucide-react";

import FocusPanelCardGrid from "@/components/admin/focusPanel/FocusPanelCardGrid";
import FocusPanelCardRenderer from "@/components/admin/focusPanel/FocusPanelCardRenderer";
import OpportunityFocusPanelHeader from "@/components/admin/focusPanel/OpportunityFocusPanelHeader";
import {
    FOCUS_PANEL_GRID_COLUMNS,
    type FocusPanelGridArea,
    type FocusPanelGridLayout,
    type FocusPanelPublishedLayout,
} from "@/lib/adminV2/runtime/focusPanel/composition/focusPanelPublishedLayout";
import {
    addCardToGrid,
    buildPublishedLayoutFromGrid,
    cardsInGrid,
    clampArea,
    closeEmptyRowBands,
    COMPOSER_GRID_GAP_PX,
    composerGridMetrics,
    parseTrackSizes,
    spanBounds,
    trackEdges,
    trackFromOffset,
    defaultRowSpanForCard,
    gridFromPublishedLayout,
    removeArea,
    resizeArea,
    resolveDropPlacement,
} from "@/lib/adminV2/runtime/focusPanel/composition/focusPanelGridLayoutOps";
import { defaultColumnsForCard } from "@/lib/adminV2/runtime/focusPanel/focusPanelCardAuthoring";
import {
    beginRecording,
    markActivated,
    recordedGestureCount,
    recordingActivated,
    recordingIsAutomatic,
    finishRecording,
    recordFrame,
} from "@/lib/adminV2/runtime/focusPanel/composition/composerDragRecorder";
import { resolveColumnAwareDrop, snapColumnStart } from "@/lib/adminV2/runtime/focusPanel/composition/focusPanelColumnAwareLayout";
import { publishComposerLayoutDump } from "@/lib/adminV2/runtime/focusPanel/composition/composerLayoutDump";
import {
    beginComposerDragTrace,
    describeTraceTarget,
    traceComposerDrag,
} from "@/lib/adminV2/runtime/focusPanel/composition/composerDragTrace";
import { composeEffectiveCardModel } from "@/lib/adminV2/runtime/focusPanel/focusPanelCardConfigModel";
import { deriveFocusPanelSummaryCompositionInputs } from "@/lib/adminV2/runtime/focusPanel/deriveFocusPanelSummaryCompositionInputs";
import {
    buildSummaryDocFromOrder,
    type SummaryCardOrderEntry,
} from "@/lib/adminV2/runtime/focusPanel/focusPanelSummaryDocOps";
import { withPublishedLayoutMetadata } from "@/lib/adminV2/runtime/focusPanel/composition/focusPanelPublishedLayoutOps";
import { buildOpportunityFocusPanelMutation } from "@/lib/adminV2/runtime/focusPanel/focusPanelMutation";
import {
    isElevatedLevel,
    resolveElevatedCellKey,
    type FocusPanelActiveDepth,
    type FocusPanelCoordination,
    type FocusPanelDepthEntry,
    type FocusPanelDismissSignal,
    type FocusPanelFocusRequest,
} from "@/lib/adminV2/runtime/focusPanel/focusPanelCoordinationModel";
import type { FocusPanelMode } from "@/lib/adminV2/runtime/focusPanel/focusPanelMode";
import type { FocusPanelCardKey, FocusPanelCardModel } from "@/lib/adminV2/runtime/focusPanel/focusPanelCardModel";
import type { FocusPanelCardDensity } from "@/lib/adminV2/runtime/focusPanel/focusPanelCardGrid";
import type { OperationalContext } from "@/lib/adminV2/runtime/operationalContext/types";
import type { OpportunityDrawerViewModel } from "@/lib/adminV2/viewModel/drawer/types";
import { useFocusPanelComposer } from "@/lib/adminV2/settings/surfaces/focusPanelComposerContext";

/** Reverse-zoom dismiss window — matches runtime depth animation. */
const FOCUS_PANEL_DEPTH_MS = 240;

type NestedSurfaceTarget = {
    surfaceId: string;
    surfaceLabel: string;
};

type Props = {
    /** Seed grid from loaded published layout (converted once on mount). */
    initialGrid: FocusPanelGridLayout;
    /**
     * The authorable library, with each entry's PLACEMENT.
     *
     * `variantLabel` + `columns` are what let one canonical identity be offered in more than one
     * shape — Financials Summary (8/12) and Financials Compact (4/12) — without a second card key.
     */
    /** Records a placement variant's density on the card's own config. */
    onCardDensityChange?: (card: FocusPanelCardKey, density: FocusPanelCardDensity) => void;
    /**
     * Spans the inspector has asked for, by card.
     *
     * A presentation switch is two facts — the density the card reads, and the width
     * the platform places it at. The density reaches the card through its config;
     * this is the other half, applied to the grid the canvas owns rather than by
     * letting a second writer edit that grid behind its back.
     */
    desiredSpanByCard?: Partial<Record<FocusPanelCardKey, number>>;
    catalog: {
        key: FocusPanelCardKey;
        label: string;
        variantLabel?: string;
        density?: FocusPanelCardDensity;
        columns?: number;
    }[];
    order: SummaryCardOrderEntry[];
    cards: Map<FocusPanelCardKey, FocusPanelCardModel>;
    vm: OpportunityDrawerViewModel;
    record: Record<string, unknown>;
    previewContext: OperationalContext;
    title: string;
    statusLabel: string | null;
    /** Emits the full published layout on every layout edit. */
    onLayoutChange?: (layout: FocusPanelPublishedLayout) => void;
    onSelectCard?: (key: FocusPanelCardKey) => void;
    selectedCard?: FocusPanelCardKey | null;
    nestedSurfaceByCard?: Partial<Record<FocusPanelCardKey, NestedSurfaceTarget>>;
};

type Ghost = { colStart: number; colSpan: number; rowStart: number; rowSpan: number };

/**
 * Runtime-first Focus Panel composer canvas.
 *
 * Renders the same shell + card grid the operator sees on /work-unit, with subtle
 * composer affordances (selection outline, hover handles, add tray) layered on top.
 * Layout authoring still flows through the published grid model the runtime consumes.
 */
export default function FocusPanelRuntimeComposerCanvas({
    initialGrid,
    catalog,
    onCardDensityChange,
    desiredSpanByCard,
    order,
    cards,
    vm,
    record,
    previewContext,
    title,
    statusLabel,
    onLayoutChange,
    onSelectCard,
    selectedCard,
    nestedSurfaceByCard,
}: Props) {
    const composer = useFocusPanelComposer();
    const [grid, setGrid] = useState<FocusPanelGridLayout>(initialGrid);
    /*
     * THE PREVIEW IS THE LAYOUT, NOT A RECTANGLE FLOATING OVER THE OLD ONE.
     *
     * A ghost drawn on the pre-drop canvas is drawn in the wrong coordinate space
     * the moment a drop reflows anything: the model agreed with itself, and the
     * operator still saw the card land somewhere the preview never showed. Fifteen
     * of forty live gestures diverged that way. While a drag is live the canvas
     * renders the RESOLVED layout, so the drop moves nothing — the cards are
     * already where they are going, and the commit is the picture.
     */
    const [previewGrid, setPreviewGrid] = useState<FocusPanelGridLayout | null>(null);
    const [draggingCard, setDraggingCard] = useState<FocusPanelCardKey | null>(null);
    /*
     * A VISIBLE SIGN THAT THE RECORDER IS IN THIS TAB.
     *
     * Two rounds of operator QA produced no trace, and the sink was fine both
     * times — the page simply predated the recorder. "Nothing was captured" reads
     * identically to "nothing happened", so the builder says which it is.
     */
    const [tracedGestures, setTracedGestures] = useState(0);
    const renderGrid = previewGrid ?? grid;
    const [activeMode, setActiveMode] = useState<FocusPanelMode>("summary");
    const [ghost, setGhost] = useState<Ghost | null>(null);
    const [arranging, setArranging] = useState(false);
    const surfaceRef = useRef<HTMLDivElement>(null);
    const gridContainerRef = useRef<HTMLDivElement>(null);
    const interacting = useRef(false);

    const cols = grid.columns || FOCUS_PANEL_GRID_COLUMNS;
    const placed = new Set(cardsInGrid(grid));
    // Tray = library only (not yet in order). Linked/Hidden stay in visibility zones, not tray.
    const inOrder = new Set(order.map((entry) => entry.key));
    const tray = catalog.filter((c) => !placed.has(c.key) && !inOrder.has(c.key));

    /*
     * EVERY COMMITTED LAYOUT IS A COMPACT ONE.
     *
     * Rows are placed by explicit line and sized `minmax(76px, auto)`, so a row
     * index nothing occupies is still a track that reserves its height. Removing
     * a card, resizing one, or moving one out of the bottom row all leave such
     * indices behind — and the canvas grew hundreds of pixels of empty space
     * above the cards as a result. Gravity is applied HERE, at the single seam
     * every layout change already passes through, so no caller can forget it and
     * what is saved is exactly what is shown.
     */
    const applyGrid = useCallback(
        (next: FocusPanelGridLayout) => {
            /*
             * BANDS, NOT GRAVITY.
             *
             * `compactGridRows` re-decides every card's row, so committing through it
             * undid the very placement the operator had just been shown: the anchored
             * card fell back to the earliest row it fitted. Closing empty bands does
             * the one thing compaction owes the canvas — no phantom rows — and leaves
             * every decided position alone.
             */
            const packed = closeEmptyRowBands(next);
            setGrid(packed);
            onLayoutChange?.(buildPublishedLayoutFromGrid(packed));
        },
        [onLayoutChange],
    );

    // Visible/Linked/Hidden changes must relocate cards on the composer canvas immediately.
    // Linked/Hidden leave the Visible grid; returning to Visible re-adds them.
    const onLayoutChangeRef = useRef(onLayoutChange);
    onLayoutChangeRef.current = onLayoutChange;
    useEffect(() => {
        const visibleKeys = order
            .filter((entry) => (entry.visibility ?? "visible") === "visible")
            .map((entry) => entry.key);
        const visibleSet = new Set(visibleKeys);
        setGrid((prev) => {
            const placedKeys = cardsInGrid(prev);
            const placedSet = new Set(placedKeys);
            const toRemove = placedKeys.filter((key) => !visibleSet.has(key));
            const toAdd = visibleKeys.filter((key) => !placedSet.has(key));
            if (toRemove.length === 0 && toAdd.length === 0) return prev;
            let next = prev;
            for (const key of toRemove) next = removeArea(next, key);
            for (const key of toAdd) {
                /*
                 * A card made Visible used to arrive FULL WIDTH: `addCardToGrid` defaults
                 * `colSpan` to the whole row when the caller states none, and this call
                 * stated none. So a surface built through the visibility control had every
                 * card spanning 12 columns, no row ever had a vacancy beside anything, and
                 * a drag could only ever stack. The tray's own add path
                 * (`onAddCard`) has always passed a width; this one simply never did.
                 */
                next = addCardToGrid(next, key, {
                    colSpan: defaultColumnsForCard(key),
                    rowSpan: defaultRowSpanForCard(key),
                });
            }
            onLayoutChangeRef.current?.(buildPublishedLayoutFromGrid(next));
            return next;
        });
    }, [order]);

    /*
     * Apply a requested presentation span to the grid the canvas owns.
     *
     * Only when it actually differs, so this cannot fight the operator's own
     * resize: a drag to a new width leaves `desiredSpanByCard` untouched, and this
     * effect has nothing to say about it.
     */
    useEffect(() => {
        if (!desiredSpanByCard) return;
        setGrid((prev) => {
            let next = prev;
            for (const [card, span] of Object.entries(desiredSpanByCard)) {
                if (typeof span !== "number") continue;
                const area = next.areas.find((a) => a.card === card);
                if (!area || area.colSpan === span) continue;
                next = resizeArea(next, card as FocusPanelCardKey, span, area.rowSpan);
            }
            if (next === prev) return prev;
            onLayoutChangeRef.current?.(buildPublishedLayoutFromGrid(next));
            return next;
        });
    }, [desiredSpanByCard]);

    const publishedLayout = useMemo(() => buildPublishedLayoutFromGrid(renderGrid), [renderGrid]);

    /*
     * The canvas describes itself. Whatever is on screen — committed or previewed —
     * can be read back in full from `window.__ALLOY_SURFACE_STATE__()`, so a failed
     * gesture is answered from the builder's own geometry instead of from a
     * screenshot or from the operator retyping rows and spans.
     */
    useEffect(() => {
        publishComposerLayoutDump({
            committed: grid,
            preview: previewGrid,
            selectedCard: selectedCard ?? null,
            draggingCard,
        });
    }, [grid, previewGrid, selectedCard, draggingCard]);

    const workingDoc = useMemo(() => {
        const doc = buildSummaryDocFromOrder(order);
        return { ...doc, metadata: withPublishedLayoutMetadata(doc.metadata, publishedLayout) };
    }, [order, publishedLayout]);

    const summaryInputs = useMemo(
        () => deriveFocusPanelSummaryCompositionInputs(workingDoc, { cards }),
        [workingDoc, cards],
    );

    const configByKey = useMemo(() => {
        const map = new Map<FocusPanelCardKey, SummaryCardOrderEntry["config"]>();
        order.forEach((entry) => map.set(entry.key, entry.config));
        return map;
    }, [order]);

    // ── In-panel drill-in coordination (same model as runtime) ───────────────
    const [focusRequest, setFocusRequest] = useState<FocusPanelFocusRequest | null>(null);
    const focusNonceRef = useRef(0);
    const depthHistoryRef = useRef<FocusPanelDepthEntry[]>([]);
    const [previousFocus, setPreviousFocus] = useState<FocusPanelDepthEntry | null>(null);
    const emitFocus = useCallback((card: FocusPanelCardKey, focus: string | null) => {
        focusNonceRef.current += 1;
        setFocusRequest({ card, focus, nonce: focusNonceRef.current });
    }, []);
    const requestFocus = useCallback<FocusPanelCoordination["requestFocus"]>(
        (card, focus, source) => {
            if (source) {
                depthHistoryRef.current = [...depthHistoryRef.current, source];
                setPreviousFocus(source);
            }
            emitFocus(card, focus);
        },
        [emitFocus],
    );
    const back = useCallback(() => {
        const stack = depthHistoryRef.current;
        const prev = stack[stack.length - 1];
        if (!prev) return;
        depthHistoryRef.current = stack.slice(0, -1);
        setPreviousFocus(depthHistoryRef.current[depthHistoryRef.current.length - 1] ?? null);
        emitFocus(prev.card, prev.focus);
    }, [emitFocus]);

    const [activeDepth, setActiveDepth] = useState<FocusPanelActiveDepth | null>(null);
    const reportPerspective = useCallback<NonNullable<FocusPanelCoordination["reportPerspective"]>>(
        (card, level) => {
            setActiveDepth((prev) => {
                if (isElevatedLevel(level)) return { card, level };
                return prev?.card === card ? null : prev;
            });
        },
        [],
    );

    const [dismissed, setDismissed] = useState<FocusPanelDismissSignal | null>(null);
    const [closing, setClosing] = useState(false);
    const dismissNonceRef = useRef(0);
    const closeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const dismiss = useCallback<NonNullable<FocusPanelCoordination["dismiss"]>>((card) => {
        if (composer?.drillIn?.cardKey === card) composer.exitDrillIn();
        if (closeTimerRef.current) return;
        setClosing(true);
        closeTimerRef.current = setTimeout(() => {
            closeTimerRef.current = null;
            dismissNonceRef.current += 1;
            setDismissed({ card, nonce: dismissNonceRef.current });
            setClosing(false);
            depthHistoryRef.current = [];
            setPreviousFocus(null);
        }, FOCUS_PANEL_DEPTH_MS);
    }, [composer]);
    useEffect(
        () => () => {
            if (closeTimerRef.current) clearTimeout(closeTimerRef.current);
        },
        [],
    );

    const coordination = useMemo<FocusPanelCoordination>(
        () => ({
            request: focusRequest,
            requestFocus,
            activeDepth,
            reportPerspective,
            dismissed,
            dismiss,
            previousFocus,
            back,
        }),
        [focusRequest, requestFocus, activeDepth, reportPerspective, dismissed, dismiss, previousFocus, back],
    );
    const elevatedCellKey = useMemo(
        () => resolveElevatedCellKey(activeDepth?.card ?? null, summaryInputs.cellResolution),
        [activeDepth?.card, summaryInputs.cellResolution],
    );

    // Centered drill-in: when a card elevates, the composer body freezes to
    // `overflow: hidden` (page must not scroll). Reset its scroll to the top FIRST so
    // the elevated card — anchored near the top of the visible canvas — is fully in
    // view (no top/bottom cutoff), matching the runtime centered-focus behavior. The
    // grid's own scroll-to-top pass can't target this body once it is overflow:hidden.
    useLayoutEffect(() => {
        if (!activeDepth) return;
        const body = surfaceRef.current;
        if (body) body.scrollTop = 0;
    }, [activeDepth]);

    useEffect(() => {
        if (!activeDepth) return;
        const onKey = (event: KeyboardEvent) => {
            if (event.key !== "Escape") return;
            event.preventDefault();
            event.stopPropagation();
            dismiss(activeDepth.card);
        };
        window.addEventListener("keydown", onKey, true);
        return () => window.removeEventListener("keydown", onKey, true);
    }, [activeDepth, dismiss]);

    const mutation = useMemo(
        () =>
            buildOpportunityFocusPanelMutation({
                canMutate: false,
                opportunityId: String(vm.entity.id),
                truth: record,
            }),
        [vm.entity.id, record],
    );

    /**
     * The canvas's REAL geometry, read fresh from the browser.
     *
     * Rows are content-sized, so there is no constant pitch to compute from — and
     * even the columns are better read than derived, because the browser has
     * already resolved them. Re-reading on every call rather than caching is
     * deliberate: rows resize as cards move during a drag, and a cached edge list
     * is exactly the stale geometry that made a drop land where the ghost never
     * showed.
     */
    const measureCanvas = useCallback(() => {
        const canvas = gridContainerRef.current?.querySelector(".alloy-os-fp-canvas--grid");
        const el = (canvas ?? gridContainerRef.current) as HTMLElement | null;
        if (!el) return null;
        const rect = el.getBoundingClientRect();
        const style = window.getComputedStyle(el);
        const colSizes = parseTrackSizes(style.gridTemplateColumns);
        const rowSizes = parseTrackSizes(style.gridTemplateRows);
        const fallback = composerGridMetrics(rect.width, cols);
        return {
            rect,
            colEdges: colSizes.length ? trackEdges(colSizes, COMPOSER_GRID_GAP_PX) : trackEdges(
                Array.from({ length: cols }, () => fallback.trackWidth), COMPOSER_GRID_GAP_PX,
            ),
            rowEdges: rowSizes.length ? trackEdges(rowSizes, COMPOSER_GRID_GAP_PX) : [0],
            colPitch: fallback.columnPitch,
            rowPitch: fallback.rowPitch,
        };
    }, [cols]);

    /*
     * The cards as RENDERED. Vertical authoring now reasons about the same boxes
     * the runtime draws, rather than about grid row tracks the renderer stopped
     * using when placement became column-aware. Reading the DOM keeps composer and
     * runtime on one description of the canvas.
     */
    /*
     * EVERY PRESS ON A CARD IS RECORDED — activated or not.
     *
     * The recorder used to begin inside `startMove`, so a press that picked
     * nothing up produced no trace at all. That is the single most useful thing it
     * could have told us: the operator reproduced the failure with recording on
     * and the directory stayed empty, which is itself the answer — the gesture
     * never activated. It cannot say that if it only records gestures that did.
     */
    useEffect(() => {
        const container = gridContainerRef.current;
        if (!container || !recordingIsAutomatic()) return;
        const onDown = (ev: globalThis.PointerEvent) => {
            const cell = (ev.target as HTMLElement | null)?.closest?.("[data-fp-composer-cell]");
            if (!cell) return;
            beginRecording({
                card: cell.getAttribute("data-fp-composer-cell"),
                activator: null,
                grab: null,
                layoutBefore: grid.areas.map((a) =>
                    `${a.card} c${a.colStart}+${a.colSpan} r${a.rowStart}+${a.rowSpan}`),
            });
            recordFrame("down", ev);
            // Once it is a real drag the runtime records the frames WITH decisions;
            // this listener only covers the presses that never got that far.
            const onMove = (m: globalThis.PointerEvent) => {
                if (!recordingActivated()) recordFrame("move", m);
            };
            const onUp = (u: globalThis.PointerEvent) => {
                recordFrame("up", u);
                window.removeEventListener("pointermove", onMove, true);
                window.removeEventListener("pointerup", onUp, true);
                window.removeEventListener("pointercancel", onUp, true);
                // The drag runtime finishes its own recording; this only closes the
                // ones it never took over.
                window.setTimeout(() => finishRecording(null), 0);
            };
            window.addEventListener("pointermove", onMove, true);
            window.addEventListener("pointerup", onUp, true);
            window.addEventListener("pointercancel", onUp, true);
        };
        container.addEventListener("pointerdown", onDown, true);
        return () => container.removeEventListener("pointerdown", onDown, true);
    }, [grid]);

    const measureCardBoxes = useCallback(() => {
        const boxes = new Map<string, { top: number; height: number }>();
        const canvas = gridContainerRef.current?.querySelector(".alloy-os-fp-canvas--grid");
        if (!canvas) return boxes;
        const base = canvas.getBoundingClientRect();
        for (const el of Array.from(canvas.querySelectorAll("[data-fp-grid-area]"))) {
            const card = el.getAttribute("data-fp-grid-area");
            if (!card) continue;
            const r = el.getBoundingClientRect();
            boxes.set(card, { top: r.top - base.top, height: r.height });
        }
        return boxes;
    }, []);

    const cellFromPointer = useCallback(
        (clientX: number, clientY: number) => {
            const m = measureCanvas();
            if (!m) return { col: 1, row: 1 };
            const col = trackFromOffset(clientX - m.rect.left, m.colEdges, m.colPitch);
            const row = trackFromOffset(clientY - m.rect.top, m.rowEdges, m.rowPitch);
            return { col: Math.min(cols, Math.max(1, col)), row: Math.max(1, row) };
        },
        [cols, measureCanvas],
    );

    /*
     * The ghost is drawn from the SAME measured tracks the drop resolves against, so
     * the preview and the landing place cannot disagree. They used to be computed
     * independently, which is how the ghost came to show a position the card did not
     * take.
     */
    const ghostBounds = useMemo(() => {
        if (!ghost || !gridContainerRef.current) return null;
        const container = gridContainerRef.current;
        const m = measureCanvas();
        if (!m) return null;
        const cRect = container.getBoundingClientRect();
        const x = spanBounds(ghost.colStart, ghost.colSpan, m.colEdges, COMPOSER_GRID_GAP_PX, m.colPitch);
        const y = spanBounds(ghost.rowStart, ghost.rowSpan, m.rowEdges, COMPOSER_GRID_GAP_PX, m.rowPitch);
        return {
            left: m.rect.left - cRect.left + x.offset,
            top: m.rect.top - cRect.top + y.offset,
            width: x.size,
            height: y.size,
        };
        // `renderGrid`, not `grid`: while a drag is live the canvas shows the RESOLVED
        // layout, and a ghost measured against the committed one is drawn in the wrong
        // coordinate space — the exact divergence this preview exists to remove.
    }, [ghost, measureCanvas, renderGrid]);

    /*
     * The preview and the drop ask the SAME question of the SAME authority.
     *
     * They used to ask different ones — the ghost `snapMoveTarget`, the drop
     * `moveArea` — and the answers differed for most of the canvas, so the card
     * landed where the operator had not been shown. `resolveDropPlacement`
     * returns both the landing area and the layout that lands it; the ghost
     * draws the first and the drop commits the second.
     */
    const resolvePlacement = useCallback(
        (source: FocusPanelGridLayout, area: FocusPanelGridArea, col: number, row: number) =>
            resolveDropPlacement(source, area, col, row),
        [],
    );

    const startMove = (e: PointerEvent, area: FocusPanelGridArea) => {
        if (interacting.current) return;
        interacting.current = true;
        beginComposerDragTrace();
        /*
         * NOT preventDefault/stopPropagation here.
         *
         * Suppressing the press outright also suppresses the click that follows it,
         * so every other affordance on the card — selection, Configure — died the
         * moment the whole body became a drag surface. Both are deferred to the
         * first qualifying MOVE, where a real drag is actually underway.
         */
        // Capture on the element itself, read now — the event object does not outlive dispatch.
        const captureEl = e.currentTarget as HTMLElement | null;
        traceComposerDrag("activate", {
            card: area.card,
            activator: describeTraceTarget(e.currentTarget as EventTarget),
            pressTarget: describeTraceTarget(e.target as EventTarget),
            authoredSpan: { colSpan: area.colSpan, rowSpan: area.rowSpan },
            from: { colStart: area.colStart, rowStart: area.rowStart },
            pointer: { x: Math.round(e.clientX), y: Math.round(e.clientY) },
        });
        try {
            captureEl?.setPointerCapture(e.pointerId);
        } catch {
            /* capture is an optimisation; window listeners below do the real work */
        }
        // A press is a click until the pointer travels. Nothing is arranged, previewed
        // or committed before that, so selecting a card never nudges the layout.
        const pressX = e.clientX;
        const pressY = e.clientY;
        let travelled = false;
        const hasTravelled = (ev: globalThis.PointerEvent) =>
            travelled
            || (travelled =
                Math.abs(ev.clientX - pressX) + Math.abs(ev.clientY - pressY) >= 4);
        // Preserve grab point so the card does not teleport under the cursor mid-drag.
        const origin = cellFromPointer(e.clientX, e.clientY);
        const grabColOffset = origin.col - area.colStart;
        const grabRowOffset = origin.row - area.rowStart;
        const gridAtStart = grid;
        /*
         * ── THE REFERENCE FRAME IS FROZEN AT THE GRAB ──
         *
         * The boxes were re-measured on every pointermove, and by then the DOM was
         * showing the PREVIEW produced by the previous frame. So each decision was
         * made against geometry the previous decision had rearranged: choose a
         * stack, the cards move, and the moved cards then keep confirming that
         * choice. That is the stickiness — move right, then further left, and the
         * left stack never wins back, because the frame of reference travelled with
         * the decision.
         *
         * A scripted drag mostly escapes it by going straight to its destination
         * and sampling once. A human wanders, so a human hits it every time. Both
         * now resolve against the canvas as it was when the card was picked up, so
         * every pointermove answers independently: given the pointer NOW, what
         * placement is intended NOW?
         */
        const boxesAtStart = measureCardBoxes();
        markActivated({
            activator: describeTraceTarget(e.currentTarget as EventTarget),
            grab: { colOffset: grabColOffset, rowOffset: grabRowOffset, cell: origin },
        });
        /*
         * Frozen geometry. The preview reflows the canvas underneath the pointer, so
         * measuring live would let the preview move the tracks that decide the
         * preview — a feedback loop the operator feels as the ghost flickering
         * between two rows. The mapping is the canvas the gesture began on.
         */
        const metricsAtStart = measureCanvas();
        const cellFromPointerFrozen = (clientX: number, clientY: number) => {
            if (!metricsAtStart) return cellFromPointer(clientX, clientY);
            const live = measureCanvas();
            const rect = live?.rect ?? metricsAtStart.rect;
            const localX = clientX - rect.left;
            const localY = clientY - rect.top;
            const rawCol = trackFromOffset(localX, metricsAtStart.colEdges, metricsAtStart.colPitch);
            const rawRow = trackFromOffset(localY, metricsAtStart.rowEdges, metricsAtStart.rowPitch);
            const col = Math.min(cols, Math.max(1, rawCol));
            const row = Math.max(1, rawRow);
            traceComposerDrag("map", {
                client: { x: Math.round(clientX), y: Math.round(clientY) },
                rectLeft: Math.round(rect.left),
                rectTop: Math.round(rect.top),
                frozenLeft: Math.round(metricsAtStart.rect.left),
                frozenTop: Math.round(metricsAtStart.rect.top),
                local: { x: Math.round(localX), y: Math.round(localY) },
                raw: { col: rawCol, row: rawRow },
                clamped: { col, row },
            });
            return { col, row };
        };
        traceComposerDrag("pointerdown", {
            card: area.card,
            grab: { colOffset: grabColOffset, rowOffset: grabRowOffset, cell: origin },
            gridColumns: gridAtStart.columns,
            occupied: gridAtStart.areas.map((a) =>
                `${a.card} c${a.colStart}+${a.colSpan} r${a.rowStart}+${a.rowSpan}`),
        });
        const resolveTarget = (clientX: number, clientY: number) => {
            const { col, row } = cellFromPointerFrozen(clientX, clientY);
            const live = measureCanvas();
            const canvasTop = live?.rect.top ?? metricsAtStart?.rect.top ?? 0;
            /*
             * The pointer is not naming a row. It is saying "this card belongs in
             * these columns, at this height in their stack" — so the drop is
             * resolved against the cards that actually share those columns.
             */
            const drop = resolveColumnAwareDrop({
                layout: gridAtStart,
                moving: area,
                /*
                 * The pointer names the destination; the grip does not. Subtracting the
                 * grab offset here made reachable columns depend on where inside the card
                 * the press landed — grab a 6-span card on its right and the left half
                 * needed the cursor off-canvas to reach.
                 */
                colStart: snapColumnStart({
                    pointerColumn: col,
                    colSpan: area.colSpan,
                    columns: gridAtStart.columns,
                }),
                pointerY: clientY - canvasTop,
                boxes: boxesAtStart,
                gapPx: COMPOSER_GRID_GAP_PX,
            });
            const landed = drop.layout.areas.find((a) => a.card === area.card) ?? area;
            return {
                placement: {
                    area: landed,
                    grid: drop.layout,
                    reflowed: true,
                    how: "insert" as const,
                    asked: { colStart: landed.colStart, rowStart: landed.rowStart },
                },
                pointerCell: { col, row },
                after: drop.after,
                overlapping: drop.overlapping,
            };
        };
        const cleanup = () => {
            setGhost(null);
            setPreviewGrid(null);
            setDraggingCard(null);
            window.setTimeout(() => setTracedGestures(recordedGestureCount()), 600);
            interacting.current = false;
            setArranging(false);
            try {
                captureEl?.releasePointerCapture(e.pointerId);
            } catch {
                /* pointer already released */
            }
            window.removeEventListener("pointermove", move);
            window.removeEventListener("pointerup", up);
            window.removeEventListener("pointercancel", cancel);
        };
        let dragging = false;
        let lastPreviewSignature = "";
        const move = (ev: globalThis.PointerEvent) => {
            if (!hasTravelled(ev)) return;
            if (!dragging) {
                dragging = true;
                setArranging(true);
                setDraggingCard(area.card);
                // Now it is a drag: stop the browser turning it into a text selection.
                ev.preventDefault();
            }
            const { placement, pointerCell, after, overlapping } = resolveTarget(ev.clientX, ev.clientY);
            traceComposerDrag("move", {
                card: area.card,
                pointer: { x: Math.round(ev.clientX), y: Math.round(ev.clientY) },
                pointerCell,
                after,
                overlapping,
                asked: placement.asked,
                how: placement.how,
                ghost: {
                    colStart: placement.area.colStart,
                    colSpan: placement.area.colSpan,
                    rowStart: placement.area.rowStart,
                    rowSpan: placement.area.rowSpan,
                },
            });
            recordFrame("move", ev, {
                pointerCell, after, overlapping,
                landed: {
                    colStart: placement.area.colStart, colSpan: placement.area.colSpan,
                    rowStart: placement.area.rowStart,
                },
            });
            setGhost({
                colStart: placement.area.colStart,
                colSpan: placement.area.colSpan,
                rowStart: placement.area.rowStart,
                rowSpan: placement.area.rowSpan,
            });
            // Only when the answer changes: a re-render per pointer sample is jank.
            const signature = placement.grid.areas
                .map((a) => `${a.card}:${a.colStart}:${a.rowStart}:${a.colSpan}:${a.rowSpan}`)
                .join("|");
            if (signature !== lastPreviewSignature) {
                lastPreviewSignature = signature;
                setPreviewGrid(placement.grid);
            }
        };
        const up = (ev: globalThis.PointerEvent) => {
            // A press that never travelled is a click: leave the layout untouched.
            if (!hasTravelled(ev)) {
                traceComposerDrag("declined", { card: area.card, reason: "no_travel" });
                cleanup();
                return;
            }
            const { placement } = resolveTarget(ev.clientX, ev.clientY);
            traceComposerDrag("drop", {
                card: area.card,
                how: placement.how,
                asked: placement.asked,
                committed: {
                    colStart: placement.area.colStart,
                    colSpan: placement.area.colSpan,
                    rowStart: placement.area.rowStart,
                    rowSpan: placement.area.rowSpan,
                },
                layout: placement.grid.areas.map((a) =>
                    `${a.card} c${a.colStart}+${a.colSpan} r${a.rowStart}+${a.rowSpan}`),
            });
            recordFrame("up", ev, {
                committed: {
                    colStart: placement.area.colStart, colSpan: placement.area.colSpan,
                    rowStart: placement.area.rowStart,
                },
            });
            finishRecording(placement.grid.areas.map((a) =>
                `${a.card} c${a.colStart}+${a.colSpan} r${a.rowStart}+${a.rowSpan}`));
            applyGrid(placement.grid);
            cleanup();
        };
        const cancel = (ev: globalThis.PointerEvent) => {
            // Invalid/cancelled drop returns the card to its exact original position.
            recordFrame("cancel", ev);
            finishRecording(gridAtStart.areas.map((a) =>
                `${a.card} c${a.colStart}+${a.colSpan} r${a.rowStart}+${a.rowSpan}`));
            cleanup();
        };
        window.addEventListener("pointermove", move);
        window.addEventListener("pointerup", up);
        window.addEventListener("pointercancel", cancel);
    };

    const startResize = (e: PointerEvent, area: FocusPanelGridArea, axis: "w" | "h" | "wh") => {
        if (interacting.current) return;
        interacting.current = true;
        setArranging(true);
        e.preventDefault();
        e.stopPropagation();
        (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
        const canvas = gridContainerRef.current?.querySelector(".alloy-os-fp-canvas--grid");
        const measureEl = canvas ?? gridContainerRef.current;
        const move = (ev: globalThis.PointerEvent) => {
            if (!measureEl) return;
            const cell = cellFromPointer(ev.clientX, ev.clientY);
            const colSpan = axis === "h" ? area.colSpan : Math.max(1, cell.col - area.colStart + 1);
            const rowSpan = axis === "w" ? area.rowSpan : Math.max(1, cell.row - area.rowStart + 1);
            const next = clampArea(grid, { ...area, colSpan, rowSpan });
            setGhost({ colStart: next.colStart, colSpan: next.colSpan, rowStart: next.rowStart, rowSpan: next.rowSpan });
        };
        const up = (ev: globalThis.PointerEvent) => {
            if (measureEl) {
                const cell = cellFromPointer(ev.clientX, ev.clientY);
                const colSpan = axis === "h" ? area.colSpan : Math.max(1, cell.col - area.colStart + 1);
                const rowSpan = axis === "w" ? area.rowSpan : Math.max(1, cell.row - area.rowStart + 1);
                applyGrid(resizeArea(grid, area.card, colSpan, rowSpan));
            }
            setGhost(null);
            interacting.current = false;
            setArranging(false);
            try {
                (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
            } catch {
                /* pointer already released */
            }
            window.removeEventListener("pointermove", move);
            window.removeEventListener("pointerup", up);
            window.removeEventListener("pointercancel", up);
        };
        window.addEventListener("pointermove", move);
        window.addEventListener("pointerup", up);
        window.addEventListener("pointercancel", up);
    };

    /*
     * Add at the placement the LIBRARY declared, not at a fixed six columns.
     *
     * Every card arrived 6/12 regardless of what it is, so an authored panel started life wrong and
     * the operator resized card by card: Business Process is a full row, Financials Summary is 8,
     * its Compact variant is 4. The width travels with the choice, and `addCardToGrid` packs it into
     * the first row that can hold it — which is what makes 8 + 4 land beside each other instead of
     * on two rows with a hole.
     */
    const onAddCard = (card: FocusPanelCardKey, placement?: { colSpan?: number; density?: FocusPanelCardDensity }) => {
        const span = Math.max(1, Math.min(placement?.colSpan ?? Math.min(6, cols), cols));
        const withCard = addCardToGrid(grid, card, { colSpan: span, rowSpan: defaultRowSpanForCard(card) });
        applyGrid(withCard);
        // The density is part of the placement, so it is recorded with it rather than left to the
        // card's default — a Compact choice that renders as Summary is not a choice.
        if (placement?.density) onCardDensityChange?.(card, placement.density);
        /*
         * ADDING MUST BE VISIBLY CAUSAL.
         *
         * The grid gained a card and nothing else happened: on a long Surface the new
         * card landed below the fold, so "I clicked Financials" produced no observable
         * effect and the operator clicked again. Selecting it makes the inspector
         * follow the add, and scrolling to it makes the placement legible — the packer
         * already chose a real position, this only takes the operator there.
         */
        setJustAdded(card);
    };

    /*
     * Select and reveal the new card ON THE NEXT RENDER, not in the click handler.
     *
     * Selecting inline did nothing: the host resolves a card key against `order`,
     * and `order` only gains the card when the layout change this same handler
     * emitted is reconciled. Both updates batch, so the lookup ran against the
     * order from BEFORE the add and found nothing — the card appeared, unselected,
     * and the inspector kept pointing at whatever was selected before.
     *
     * Waiting a frame also fixes the reveal for the same underlying reason: the
     * cell's geometry does not exist until the grid has laid it out.
     */
    const [justAdded, setJustAdded] = useState<FocusPanelCardKey | null>(null);
    useEffect(() => {
        if (!justAdded) return;
        const frame = requestAnimationFrame(() => {
            onSelectCard?.(justAdded);
            const cell = gridContainerRef.current?.querySelector(`[data-fp-composer-cell="${justAdded}"]`);
            cell?.scrollIntoView({ behavior: "smooth", block: "nearest" });
            setJustAdded(null);
        });
        return () => cancelAnimationFrame(frame);
    }, [justAdded, onSelectCard]);

    const renderComposerCell = useCallback(
        (cellKey: string) => {
            const resolution = summaryInputs.cellResolution.get(cellKey);
            const typeKey = (resolution?.typeKey ?? cellKey) as FocusPanelCardKey;
            const baseModel = cards.get(typeKey);
            if (!baseModel) return null;

            const config = configByKey.get(typeKey) ?? resolution?.config ?? null;
            const model = composeEffectiveCardModel(baseModel, config, record);
            const area = findAreaForCard(grid, typeKey);
            const isSelected = selectedCard === typeKey;
            const nested = nestedSurfaceByCard?.[typeKey];

            return (
                <ComposerCellShell
                    cardKey={typeKey}
                    selected={isSelected}
                    arranging={arranging}
                    dragging={draggingCard === typeKey}
                    area={area}
                    onSelect={() => onSelectCard?.(typeKey)}
                    onRemove={area ? () => applyGrid(removeArea(grid, typeKey)) : undefined}
                    onStartMove={area ? (e) => startMove(e, area) : undefined}
                    onStartResize={
                        area ?
                            (e, axis) => startResize(e, area, axis)
                        :   undefined
                    }
                    nestedSurface={nested}
                    onEnterDrillIn={
                        nested && composer
                            ? () => {
                                  composer.enterDrillIn(typeKey, nested.surfaceId);
                                  requestFocus(typeKey, null);
                                  onSelectCard?.(typeKey);
                              }
                            : undefined
                    }
                >
                    {/* The AUTHORED placement travels into the preview, so a card whose
                        presentation changes with its size — Financials Compact vs Summary —
                        previews the presentation actually being placed. */}
                    <FocusPanelCardRenderer
                        model={model}
                        context={previewContext}
                        focusPanelMode="summary"
                        coordination={coordination}
                        mutation={mutation}
                        compat={{ onSelectTab: () => {} }}
                        authoringPreview={{
                            columns: area?.colSpan ?? null,
                            // `composeEffectiveCardModel` has already folded the authored
                            // appearance density onto the model, so this IS the effective one.
                            density: model.density ?? null,
                        }}
                    />
                </ComposerCellShell>
            );
        },
        [
            summaryInputs.cellResolution,
            cards,
            configByKey,
            record,
            grid,
            selectedCard,
            arranging,
            nestedSurfaceByCard,
            onSelectCard,
            applyGrid,
            previewContext,
            coordination,
            mutation,
            vm,
            composer,
            requestFocus,
        ],
    );

    const currentStatusKey = String(record.status_key ?? "").trim();

    return (
        <div
            className="alloy-os-fp-composer"
            data-focus-panel-runtime-composer="true"
            data-fp-composer-arranging={arranging ? "true" : undefined}
            data-fp-composer-edit-mode={composer?.drillIn ? "true" : undefined}
            data-fp-composer-depth-active={activeDepth ? "true" : undefined}
        >
            {/* ADD CARD LEADS THE FLOW: add → place → configure → publish.
                It used to sit under the canvas, so adding a second card to a long
                Surface meant scrolling past everything already authored to reach the
                control that adds more. */}
            {tray.length > 0 ?
                <div className="alloy-os-fp-composer__tray" data-fp-composer-tray="true" data-fp-composer-tray-position="top">
                    <Plus className="h-3.5 w-3.5 text-alloy-midnight/35" aria-hidden />
                    <span className="alloy-os-fp-composer__tray-label">Add card</span>
                    {recordingIsAutomatic() ?
                        <span
                            className="alloy-os-fp-composer__tray-label"
                            data-fp-drag-tracing="on"
                            title="Every drag on this canvas is recorded to /tmp/alloy-surface-drag-traces/"
                        >
                            · drag tracing ON{tracedGestures ? ` · ${tracedGestures} captured` : ""}
                        </span>
                    :   null}
                    {tray.map((c) => (
                        <button
                            // A variant is keyed by identity AND shape: Financials appears twice in
                            // the tray, once per placement, and both are the same `cardKey`.
                            key={`${c.key}:${c.variantLabel ?? "default"}`}
                            type="button"
                            className="alloy-os-fp-composer__chip"
                            data-fp-composer-add-card={c.key}
                            data-fp-composer-variant={c.variantLabel ?? undefined}
                            data-fp-composer-columns={c.columns ?? undefined}
                            title={trayName(c)}
                            onClick={() => onAddCard(c.key, { colSpan: c.columns, density: c.density })}
                        >
                            {/*
                              * THE PRODUCT NAME, AND NOTHING ELSE.
                              *
                              * The chip used to carry "6/12" beside every label. An operator
                              * choosing a card is choosing a card, not a track count — and the
                              * number was the internal grid primitive leaking into the product.
                              * Where a card genuinely has two presentations, the DIFFERENCE is
                              * named in operator language ("Financials — Compact"); the columns
                              * still travel with the choice, silently, as its default placement.
                              */}
                            <span className="alloy-os-fp-composer__chip-label">{trayName(c)}</span>
                        </button>
                    ))}
                </div>
            :   null}
            <section
                className="alloy-os-fp-composer__panel flex min-h-0 flex-col overflow-hidden rounded-xl border border-alloy-stone/12 bg-white shadow-sm"
                aria-label="Focus Panel composer preview"
            >
                <div
                    className="sticky top-0 z-10 shrink-0 border-b border-alloy-stone/12 bg-white"
                    style={{ minHeight: "5.25rem" }}
                >
                    <OpportunityFocusPanelHeader
                        title={title}
                        opportunityId={String(vm.entity.id)}
                        record={record}
                        displayVm={vm}
                        opportunitySingular="Opportunity"
                        statusLabel={statusLabel}
                        currentStatusKey={currentStatusKey}
                        statusControl={vm.header.status}
                        statusCanMutate={false}
                        manageCanMutate={false}
                        activeMode={activeMode}
                        onModeChange={setActiveMode}
                        hideClose
                        onClose={() => {}}
                        onSubjectManageActionSelect={() => {}}
                        actionPreflightBlocked={null}
                        onDismissActionPreflightBlocked={() => {}}
                        registryActionFeedback={null}
                    />
                </div>

                <div
                    ref={surfaceRef}
                    className="alloy-os-fp-composer__body min-h-0 flex-1 overflow-y-auto px-4 py-3 [scrollbar-gutter:stable]"
                    data-surface-canvas-builder="true"
                >
                    {activeMode === "summary" ?
                        <div ref={gridContainerRef} className="relative">
                            {/*
                              * NO FLOATING GHOST.
                              *
                              * It was a second coordinate system: an absolutely positioned
                              * rectangle derived from measured tracks, drawn over a canvas
                              * that the drop then reflowed. Measured live it sat 102px away
                              * from where the card actually landed — a preview that lies is
                              * worse than none. The canvas now renders the RESOLVED layout
                              * during the drag, so the dragged card is already in its
                              * destination and marks itself; there is nothing left to keep
                              * in sync because there is only one description of the layout.
                              */}
                            <FocusPanelCardGrid
                                rows={summaryInputs.gridRows}
                                publishedLayout={publishedLayout}
                                composeCards={summaryInputs.composeCards}
                                compositionOverrides={summaryInputs.compositionOverrides}
                                elevatedCellKey={elevatedCellKey}
                                closing={closing}
                                onBackdropClick={() => {
                                    if (activeDepth) dismiss(activeDepth.card);
                                }}
                                renderCell={renderComposerCell}
                            />
                        </div>
                    :   <p className="config-typo-sublabel py-8 text-center">
                            Activity mode preview — switch to Work to compose the Focus Panel.
                        </p>
                    }
                </div>
            </section>

        </div>
    );
}

/**
 * The operator-facing name of a tray entry.
 *
 * A variant is a different PRESENTATION of the same card, so it reads as one:
 * "Financials" and "Financials — Compact". Never "Financials 4/12" — the span is
 * how the platform places it, not what the operator is choosing.
 */
function trayName(entry: { label: string; variantLabel?: string }): string {
    const variant = entry.variantLabel?.trim();
    if (!variant) return entry.label;
    // A variant that merely restates the card's default placement adds nothing.
    if (variant.toLowerCase() === "summary") return entry.label;
    return `${entry.label} — ${variant}`;
}

function findAreaForCard(grid: FocusPanelGridLayout, card: FocusPanelCardKey): FocusPanelGridArea | undefined {
    return grid.areas.find((a) => a.card === card);
}

type ComposerCellShellProps = {
    cardKey: FocusPanelCardKey;
    selected: boolean;
    arranging: boolean;
    /** True for the card currently being dragged — it is its own drop preview. */
    dragging?: boolean;
    area?: FocusPanelGridArea;
    onSelect: () => void;
    onRemove?: () => void;
    onStartMove?: (e: PointerEvent) => void;
    onStartResize?: (e: PointerEvent, axis: "w" | "h" | "wh") => void;
    nestedSurface?: NestedSurfaceTarget;
    onEnterDrillIn?: () => void;
    children: ReactNode;
};

/** Subtle composer chrome layered over a runtime card — visible on hover/selection only. */
function ComposerCellShell({
    cardKey,
    selected,
    arranging,
    dragging = false,
    onSelect,
    onRemove,
    onStartMove,
    onStartResize,
    nestedSurface,
    onEnterDrillIn,
    children,
}: ComposerCellShellProps) {
    /*
     * THE WHOLE CARD IS THE HANDLE.
     *
     * Picking a card up used to require a 34px strip along its top edge, inset
     * 34px from the left and up to 156px from the right, and invisible until
     * hover — on a 1/3 card that is roughly 8% of its surface. Press anywhere
     * else and nothing happened at all. No placement arithmetic downstream can
     * be reached if the gesture never starts, which is why the canvas kept
     * reading as "constrained", "rigid" and "fighting the layout" while the
     * resolver underneath was answering correctly.
     *
     * So the card body starts the drag, with two guards that keep the rest of
     * the chrome usable:
     *
     *   · anything interactive inside the card (the Configure/Remove buttons,
     *     the resize handles, links, inputs) keeps its own press;
     *   · a 4px movement threshold, so a click still selects the card and only
     *     an actual drag becomes a drag.
     *
     * The visible drag bar stays. It is now an affordance that shows where to
     * grab rather than the only place that works.
     */
    /*
     * ONE HANDLE, AND IT IS THE GRIP.
     *
     * The body and the top bar both used to start drags, which made activation
     * depend on what the card happened to render under the press and on how close
     * to Configure the operator landed. Their own report showed a grab near
     * Configure that never activated at all. A single 44x44 grip removes the
     * variable: Configure, Remove, resize and card content are all just controls
     * again, and there is exactly one thing that picks a card up.
     */

    return (
        <div
            className={[
                "alloy-os-fp-composer-cell",
                selected ? "is-selected" : "",
                arranging ? "is-arranging" : "",
                dragging ? "is-dragging" : "",
            ].join(" ")}
            data-fp-composer-cell={cardKey}
            data-fp-composer-dragging={dragging ? "true" : undefined}
        >
            {children}
            {onStartMove ?
                <div className="alloy-os-fp-composer-cell__drag-bar" aria-hidden />
            :   null}
            <div className="alloy-os-fp-composer-cell__chrome" aria-hidden={!selected}>
                {onStartMove ?
                    <button
                        type="button"
                        className="alloy-os-fp-composer-cell__grip"
                        aria-label={`Move ${cardKey} card`}
                        onPointerDown={(e) => {
                            e.stopPropagation();
                            onStartMove(e);
                        }}
                    >
                        <GripVertical className="h-3.5 w-3.5" aria-hidden />
                    </button>
                :   null}
                {/* Stable top-right toolbar — Configure first (easy hit), Remove beside it. */}
                <div className="alloy-os-fp-composer-cell__toolbar">
                    {onRemove ?
                        <button
                            type="button"
                            className="alloy-os-fp-composer-cell__remove"
                            aria-label={`Remove ${cardKey} card`}
                            onClick={(e) => {
                                e.stopPropagation();
                                onRemove();
                            }}
                        >
                            <X className="h-3.5 w-3.5" aria-hidden />
                        </button>
                    :   null}
                    <button
                        type="button"
                        className="alloy-os-fp-composer-cell__configure"
                        aria-label={`Configure ${cardKey} card`}
                        onClick={(e) => {
                            e.stopPropagation();
                            onSelect();
                            onEnterDrillIn?.();
                        }}
                    >
                        Configure
                    </button>
                </div>
                {onStartResize ?
                    <>
                        <div
                            className="alloy-os-fp-composer-cell__handle alloy-os-fp-composer-cell__handle--w"
                            role="separator"
                            aria-label="Span columns"
                            onPointerDown={(e) => onStartResize(e, "w")}
                        />
                        <div
                            className="alloy-os-fp-composer-cell__handle alloy-os-fp-composer-cell__handle--h"
                            role="separator"
                            aria-label="Span rows"
                            onPointerDown={(e) => onStartResize(e, "h")}
                        />
                        <div
                            className="alloy-os-fp-composer-cell__handle alloy-os-fp-composer-cell__handle--corner"
                            role="separator"
                            aria-label="Span columns and rows"
                            onPointerDown={(e) => onStartResize(e, "wh")}
                        />
                    </>
                :   null}
            </div>
            {nestedSurface && onEnterDrillIn ?
                <button
                    type="button"
                    className="alloy-os-fp-composer-cell__expansion"
                    data-open-nested-surface={nestedSurface.surfaceId}
                    onClick={(e) => {
                        e.stopPropagation();
                        onEnterDrillIn();
                    }}
                >
                    Configure {nestedSurface.surfaceLabel} →
                </button>
            :   null}
        </div>
    );
}

/** Re-export for tests / editor seeding. */
export { gridFromPublishedLayout };

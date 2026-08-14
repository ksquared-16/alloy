"use client";

import {
    useEffect,
    useLayoutEffect,
    useMemo,
    useRef,
    useState,
    type CSSProperties,
    type ReactNode,
} from "react";

import {
    computeFocusPanelGridColumns,
    resolveFocusPanelCellGridSpan,
    type FocusPanelGridRow,
} from "@/lib/adminV2/runtime/focusPanel/focusPanelCardGrid";
import {
    composeFocusPanelSurface,
    type CompositionCardInput,
    type ComposedCardPlacement,
} from "@/lib/adminV2/runtime/focusPanel/composition/composeFocusPanelSurface";
import {
    planPublishedLayout,
    publishedLayoutReadingOrder,
    PUBLISHED_LAYOUT_MIN_PX,
    type FocusPanelPublishedLayout,
} from "@/lib/adminV2/runtime/focusPanel/composition/focusPanelPublishedLayout";
import type { CardCompositionPreference } from "@/lib/adminV2/runtime/focusPanel/cardCompositionModel";
import type { FocusPanelCardKey } from "@/lib/adminV2/runtime/focusPanel/focusPanelCardModel";

type Props = {
    rows: FocusPanelGridRow[];
    renderCell: (cellKey: string) => ReactNode;
    className?: string;
    dataFocusPanelSplitLayout?: string;
    /**
     * Operator-published explicit layout (Experience Builder). When present this is
     * the SOURCE OF TRUTH: the runtime renders these exact rows/cells/widths and only
     * collapses to one column when too narrow — it overrides auto-composition.
     */
    publishedLayout?: FocusPanelPublishedLayout | null;
    /**
     * Focus Panel Work mode: present an authored grid as column-major lanes (no dead
     * vertical gaps). Runtime presentation only — the authored grid stays the source of truth.
     */
    preferLanesFromGrid?: boolean;
    /**
     * Composition Engine input. When provided (and no `publishedLayout`), the surface
     * is COMPOSED from card semantics (interlocking lanes / composed stack) — the
     * smart DEFAULT. The legacy `rows` path is kept for Work + other modes.
     */
    composeCards?: CompositionCardInput[] | null;
    /**
     * Surface / Business Process composition overrides (Experience Builder). Merged
     * over platform-default card preferences by the engine. Keyed by card TYPE.
     */
    compositionOverrides?: Partial<Record<FocusPanelCardKey, Partial<CardCompositionPreference>>>;
    /** Cell raised in the in-panel depth layer; the rest recede. */
    elevatedCellKey?: string | null;
    /** True during the reverse-zoom dismiss window (card still mounted + elevated). */
    closing?: boolean;
    /** Clicking the depth backdrop returns to the base Work surface. */
    onBackdropClick?: () => void;
};

/**
 * Focus Panel surface renderer.
 *
 * Two layout paths share ONE depth machinery (scrim, elevation, zoom-from-origin,
 * height reservation) so Focus Cards + inline overlays behave identically:
 *   - Composition path (`composeCards`): semantics-driven lanes / stack.
 *   - Legacy grid path (`rows`): Concept B responsive grid (Work + other modes).
 */
export default function FocusPanelCardGrid({
    rows,
    renderCell,
    className,
    dataFocusPanelSplitLayout,
    publishedLayout,
    preferLanesFromGrid,
    composeCards,
    compositionOverrides,
    elevatedCellKey,
    closing,
    onBackdropClick,
}: Props) {
    const containerRef = useRef<HTMLDivElement>(null);
    const [columns, setColumns] = useState<1 | 2 | 3 | 4>(2);
    const [widthPx, setWidthPx] = useState(0);
    const composed = !!composeCards && composeCards.length > 0;
    // Ignore backdrop clicks briefly after elevation so the same pointer gesture that
    // opened a Focus Card (Message / Tour / etc.) cannot immediately dismiss it.
    const [backdropArmed, setBackdropArmed] = useState(false);
    useEffect(() => {
        if (!elevatedCellKey) {
            setBackdropArmed(false);
            return;
        }
        setBackdropArmed(false);
        const t = window.setTimeout(() => setBackdropArmed(true), 450);
        return () => window.clearTimeout(t);
    }, [elevatedCellKey]);

    // Depth = overlay, not layout. When a card elevates its content lifts out of the
    // cell (absolute via CSS), which would collapse the cell and let neighbors reflow.
    // We reserve the cell's natural height so the slot holds and the base canvas stays
    // EXACTLY where the operator left it (no shift, no jump).
    const cellRefs = useRef<Map<string, HTMLDivElement>>(new Map());
    const naturalHeights = useRef<Map<string, number>>(new Map());
    useLayoutEffect(() => {
        if (elevatedCellKey) return; // only measure while the canvas is at rest
        cellRefs.current.forEach((el, key) => {
            if (el) naturalHeights.current.set(key, el.offsetHeight);
        });
    });

    // Zoom-from-origin motion: when a card elevates, measure WHERE it sat on the
    // canvas (its cell) and where it will land (centered, near the top), then hand the
    // delta + scale to CSS via --fp-from-* so the card animates FROM its own position
    // TOWARD center (a focus zoom), not a modal pop.
    useLayoutEffect(() => {
        if (!elevatedCellKey) return;
        const grid = containerRef.current;
        const cell = cellRefs.current.get(elevatedCellKey);
        const card = cell?.querySelector<HTMLElement>(".alloy-os-ucard");
        if (!grid || !cell || !card) return;
        const gridRect = grid.getBoundingClientRect();
        const cellRect = cell.getBoundingClientRect();
        const cardWidth = Math.min(560, grid.clientWidth - 32);
        const restLeft = gridRect.left + (gridRect.width - cardWidth) / 2;
        const restTop = gridRect.top + 22;
        const dx = Math.round(cellRect.left - restLeft);
        const dy = Math.round(cellRect.top - restTop);
        const scale = cardWidth > 0 ? Math.min(1, Math.max(0.6, cellRect.width / cardWidth)) : 0.9;
        card.style.setProperty("--fp-from-x", `${dx}px`);
        card.style.setProperty("--fp-from-y", `${dy}px`);
        card.style.setProperty("--fp-from-scale", `${scale.toFixed(3)}`);
    }, [elevatedCellKey]);

    // The focused card anchors near the top of the canvas. If the panel was scrolled,
    // bring the scroll container to the top so the centered focus is fully visible.
    useEffect(() => {
        if (!elevatedCellKey) return;
        let node: HTMLElement | null = containerRef.current?.parentElement ?? null;
        while (node) {
            const style = window.getComputedStyle(node);
            const scrolls = style.overflowY === "auto" || style.overflowY === "scroll";
            if (scrolls && node.scrollHeight > node.clientHeight && node.scrollTop > 0) {
                node.scrollTo({ top: 0, behavior: "smooth" });
                break;
            }
            node = node.parentElement;
        }
    }, [elevatedCellKey]);

    useEffect(() => {
        const el = containerRef.current;
        if (!el) return;
        // Robust width measurement. The grid fills its container (CSS width:100%), so its own
        // box IS the real surface width. Two failure modes are guarded:
        //   (a) transient ZERO/tiny readings during a tab reveal or panel transition — we
        //       ignore them and keep the last valid width, so a flicker NEVER permanently
        //       collapses the surface to a stacked fallback (the reported bug);
        //   (b) a ResizeObserver that does not fire reliably during that reveal — we also
        //       re-measure on rAF, on short delays after mount (once the transition settles),
        //       and on window resize. Collapse therefore only triggers on a real, stable
        //       sub-breakpoint width.
        const commit = (raw: number) => {
            const w = raw > 1 ? raw : (el.getBoundingClientRect().width || el.parentElement?.clientWidth || 0);
            if (w <= 1) return; // transient zero — keep the last valid width
            setColumns(computeFocusPanelGridColumns(w));
            setWidthPx((prev) => (Math.abs(prev - w) < 0.5 ? prev : w));
        };
        const measure = () => commit(el.getBoundingClientRect().width);
        measure();
        const raf = requestAnimationFrame(measure);
        const settle = [setTimeout(measure, 120), setTimeout(measure, 400)];
        const ro =
            typeof ResizeObserver !== "undefined"
                ? new ResizeObserver((entries) => commit(entries[0]?.contentRect.width ?? el.getBoundingClientRect().width))
                : null;
        ro?.observe(el);
        window.addEventListener("resize", measure);
        return () => {
            cancelAnimationFrame(raf);
            settle.forEach(clearTimeout);
            ro?.disconnect();
            window.removeEventListener("resize", measure);
        };
    }, []);

    // Before the ResizeObserver reports a width (SSR + first client paint), `widthPx`
    // is 0. Treat that as "wide" so the composed/published LANES render immediately and
    // the surface NEVER falls back to the legacy responsive grid (which tiles cards at
    // content width and leaves dead whitespace). The observer corrects to the real width
    // on mount; the only sanctioned narrow override (single-column collapse) still
    // applies once a real sub-threshold width is known.
    const measuredWidth = widthPx > 0 ? widthPx : 1024;

    // Published layout is the source of truth (operator-authored). When present it
    // wins over auto-composition; the engine only fills in the default.
    const publishedPlan = useMemo(() => {
        if (!publishedLayout) return null;
        return planPublishedLayout(publishedLayout, measuredWidth, { preferLanesFromGrid });
    }, [publishedLayout, measuredWidth, preferLanesFromGrid]);

    const composition = useMemo(() => {
        if (publishedLayout || !composed) return null;
        return composeFocusPanelSurface({
            cards: composeCards!,
            availableWidthPx: measuredWidth,
            overrides: compositionOverrides,
        });
    }, [publishedLayout, composed, composeCards, measuredWidth, compositionOverrides]);

    // ── Runtime state diagnostic (the "flash-then-reflow" tracer) ────────────
    // A single snapshot of WHY the surface is rendering the strategy it is, on every
    // render. Exposed as DOM attributes + `window.__focusPanelGridDiag` / a transition
    // log; a dev console.warn fires whenever the strategy CHANGES (the reflow).
    const diag = useMemo(() => {
        let strategy: string;
        let collapsed = false;
        let reason: string;
        if (publishedPlan) {
            strategy = `published-${publishedPlan.strategy}`;
            collapsed = publishedPlan.collapsed;
            reason = collapsed
                ? `collapsed: measured ${Math.round(measuredWidth)}px < ${PUBLISHED_LAYOUT_MIN_PX}px`
                : `published ${publishedPlan.strategy} @ ${Math.round(measuredWidth)}px`;
        } else if (composition) {
            strategy = `composed-${composition.strategy}`;
            reason = `composed ${composition.strategy} @ ${Math.round(measuredWidth)}px`;
        } else {
            strategy = "legacy-grid";
            reason = `no published layout, no composition (composed=${composed})`;
        }
        return {
            widthPx: Math.round(widthPx),
            measuredWidth: Math.round(measuredWidth),
            publishedLayout: publishedLayout ? "present" : "null",
            publishedCards: publishedLayout ? publishedLayoutReadingOrder(publishedLayout).length : 0,
            strategy,
            collapsed,
            areas: publishedPlan?.areas.length ?? 0,
            lanes: publishedPlan?.lanes.length ?? composition?.lanes.length ?? 0,
            rows: publishedPlan?.rows.length ?? 0,
            order: publishedLayout ? publishedLayoutReadingOrder(publishedLayout) : (composeCards?.map((c) => c.key) ?? []),
            reason,
        };
    }, [publishedPlan, composition, publishedLayout, composed, composeCards, widthPx, measuredWidth]);

    const lastStrategy = useRef<string>("");
    useEffect(() => {
        if (typeof window === "undefined" || process.env.NODE_ENV === "production") return;
        const w = window as unknown as { __focusPanelGridDiag?: unknown; __focusPanelGridLog?: unknown[] };
        w.__focusPanelGridDiag = diag;
        (w.__focusPanelGridLog ||= []).push(diag);
        if (lastStrategy.current && lastStrategy.current !== diag.strategy) {
            // The reflow: surface switched composition strategy after a state change.
            // eslint-disable-next-line no-console
            console.warn(`[focus-panel] strategy ${lastStrategy.current} → ${diag.strategy} · ${diag.reason}`);
        }
        lastStrategy.current = diag.strategy;
    }, [diag]);

    const diagAttrs = {
        "data-fp-width-px": diag.widthPx,
        "data-fp-measured-px": diag.measuredWidth,
        "data-fp-collapsed": diag.collapsed ? "true" : "false",
        "data-fp-published-cards": diag.publishedCards,
        "data-fp-render-strategy": diag.strategy,
    } as const;

    // Shared cell box — identical attributes in both paths so the depth/elevation CSS
    // (data-fp-elevated), refs, height reservation, and zoom origin all keep working.
    const renderCellBox = (
        key: string,
        extra: { style?: CSSProperties; dataSpan?: string | number; dataWidthUnits?: number },
    ) => {
        const elevated = elevatedCellKey != null && key === elevatedCellKey;
        const reserved = elevated ? naturalHeights.current.get(key) : undefined;
        return (
            <div
                key={key}
                ref={(el) => {
                    if (el) cellRefs.current.set(key, el);
                    else cellRefs.current.delete(key);
                }}
                className="alloy-os-focus-panel-grid__cell"
                data-focus-panel-grid-cell={key}
                data-focus-panel-grid-span={extra.dataSpan}
                data-fp-width-units={extra.dataWidthUnits}
                data-fp-elevated={elevated ? "true" : undefined}
                style={{ ...extra.style, minHeight: reserved ? `${reserved}px` : extra.style?.minHeight }}
            >
                {renderCell(key)}
            </div>
        );
    };

    const scrim = elevatedCellKey ? (
        <button
            type="button"
            className="alloy-os-fp-depth-scrim"
            aria-label="Return to work surface"
            data-fp-depth-scrim="true"
            data-fp-scrim-armed={backdropArmed ? "true" : "false"}
            onClick={() => {
                if (!backdropArmed) return;
                onBackdropClick?.();
            }}
        />
    ) : null;

    // ── Published layout path (operator source of truth) ─────────────────────
    if (publishedPlan) {
        return (
            <div
                ref={containerRef}
                className={[
                    "alloy-os-focus-panel-grid",
                    "alloy-os-focus-panel-grid--composed",
                    "alloy-os-focus-panel-grid--published",
                    className,
                ]
                    .filter(Boolean)
                    .join(" ")}
                data-focus-panel-card-grid="true"
                data-fp-strategy={publishedPlan.collapsed ? "published-collapsed" : "published"}
                data-focus-panel-split-layout={dataFocusPanelSplitLayout}
                data-fp-depth={elevatedCellKey ? "active" : undefined}
                data-fp-closing={closing ? "true" : undefined}
                {...diagAttrs}
                style={{ ["--alloy-os-fp-units" as string]: publishedPlan.columnBase }}
            >
                {scrim}
                {publishedPlan.strategy === "grid" ? (
                    // V5 responsive CSS Grid: each region places at colStart/rowStart and
                    // spans columns/rows (vertical + horizontal spans, independent regions).
                    <div
                        className="alloy-os-fp-canvas alloy-os-fp-canvas--grid"
                        data-fp-strategy="published-grid"
                        style={{ ["--fp-grid-cols" as string]: publishedPlan.gridColumns }}
                    >
                        {publishedPlan.areas.map((area) => (
                            <div
                                key={area.card}
                                className="alloy-os-fp-grid-area"
                                data-fp-grid-area={area.card}
                                data-fp-grid-col={`${area.colStart}/${area.colSpan}`}
                                data-fp-grid-row={`${area.rowStart}/${area.rowSpan}`}
                                style={{
                                    gridColumn: `${area.colStart} / span ${area.colSpan}`,
                                    gridRow: `${area.rowStart} / span ${area.rowSpan}`,
                                    minHeight: area.minHeightPx ? `${area.minHeightPx}px` : undefined,
                                }}
                            >
                                {renderCellBox(area.card, { dataWidthUnits: area.colSpan })}
                            </div>
                        ))}
                    </div>
                ) : publishedPlan.strategy === "lanes" ? (
                    // Column-major: each authored column flows as one continuous lane that
                    // fills its proportional width — the surface composes with no dead space
                    // (same lane mechanism as the auto-composition default).
                    <div
                        className="alloy-os-fp-canvas alloy-os-fp-canvas--lanes"
                        data-fp-strategy="published-lanes"
                    >
                        {publishedPlan.lanes.map((lane, laneIndex) => (
                            <div
                                // eslint-disable-next-line react/no-array-index-key
                                key={laneIndex}
                                className="alloy-os-fp-lane alloy-os-fp-published-lane"
                                data-fp-published-lane={laneIndex}
                                data-fp-lane-units={lane.widthUnits}
                                style={{
                                    flexGrow: lane.widthUnits,
                                    flexShrink: 1,
                                    flexBasis: 0,
                                    ["--alloy-os-fp-lane-units" as string]: lane.widthUnits,
                                }}
                            >
                                {lane.cards.map((card) =>
                                    renderCellBox(card.key, {
                                        dataWidthUnits: lane.widthUnits,
                                        style: card.minHeightPx ? { minHeight: `${card.minHeightPx}px` } : undefined,
                                    }),
                                )}
                            </div>
                        ))}
                    </div>
                ) : (
                    <div className="alloy-os-fp-canvas alloy-os-fp-canvas--published">
                        {publishedPlan.rows.map((row, rowIndex) => (
                            <div
                                // eslint-disable-next-line react/no-array-index-key
                                key={rowIndex}
                                className="alloy-os-fp-published-row"
                                data-fp-published-row={rowIndex}
                            >
                                {row.cells.map((cell, cellIndex) => (
                                    <div
                                        // eslint-disable-next-line react/no-array-index-key
                                        key={cellIndex}
                                        className="alloy-os-fp-published-cell"
                                        data-fp-cell-units={cell.widthUnits}
                                        data-fp-cell-min-height={cell.minHeightPx ?? undefined}
                                        style={{ flexGrow: cell.widthUnits, flexShrink: 1, flexBasis: 0, minHeight: cell.minHeightPx ? `${cell.minHeightPx}px` : undefined }}
                                    >
                                        {cell.cards.map((card) => renderCellBox(card, { dataWidthUnits: cell.widthUnits }))}
                                    </div>
                                ))}
                            </div>
                        ))}
                    </div>
                )}
            </div>
        );
    }

    // ── Composition path ─────────────────────────────────────────────────────
    if (composition) {
        return (
            <div
                ref={containerRef}
                className={[
                    "alloy-os-focus-panel-grid",
                    "alloy-os-focus-panel-grid--composed",
                    className,
                ]
                    .filter(Boolean)
                    .join(" ")}
                data-focus-panel-card-grid="true"
                data-fp-strategy={composition.strategy}
                data-focus-panel-split-layout={dataFocusPanelSplitLayout}
                data-fp-depth={elevatedCellKey ? "active" : undefined}
                data-fp-closing={closing ? "true" : undefined}
                {...diagAttrs}
                style={{ ["--alloy-os-fp-units" as string]: composition.columnBase }}
            >
                {scrim}
                {composition.strategy === "lanes" ? (
                    <div className="alloy-os-fp-canvas alloy-os-fp-canvas--lanes" data-fp-strategy="lanes">
                        {composition.lanes.map((lane) => (
                            <div
                                key={lane.role}
                                className="alloy-os-fp-lane"
                                data-fp-lane={lane.role}
                                style={{
                                    flexGrow: lane.widthUnits,
                                    flexShrink: 1,
                                    flexBasis: 0,
                                    ["--alloy-os-fp-lane-units" as string]: lane.widthUnits,
                                }}
                            >
                                {lane.cards.map((card) =>
                                    renderCellBox(card.key, {
                                        dataWidthUnits: card.widthUnits,
                                        style: { ["--fp-card-density" as string]: card.density },
                                    }),
                                )}
                            </div>
                        ))}
                    </div>
                ) : (
                    <div className="alloy-os-fp-canvas alloy-os-fp-canvas--stack" data-fp-strategy="stack">
                        {composition.stack.map((card) =>
                            renderCellBox(card.key, {
                                dataWidthUnits: card.widthUnits,
                                style: { gridColumn: `span ${card.widthUnits}` },
                            }),
                        )}
                    </div>
                )}
            </div>
        );
    }

    // ── Legacy responsive grid path (Work + other modes) ─────────────────────
    return (
        <div
            ref={containerRef}
            className={["alloy-os-focus-panel-grid", className].filter(Boolean).join(" ")}
            data-focus-panel-card-grid="true"
            data-focus-panel-grid-columns={columns}
            data-focus-panel-split-layout={dataFocusPanelSplitLayout}
            data-fp-depth={elevatedCellKey ? "active" : undefined}
            {...diagAttrs}
            style={{ ["--alloy-os-fp-cols" as string]: columns }}
        >
            {scrim}
            {rows.flatMap((row) =>
                row.cells.map((cell) => {
                    const span = resolveFocusPanelCellGridSpan(cell.span, columns);
                    return renderCellBox(cell.key, {
                        dataSpan: cell.span,
                        style: { gridColumn: `span ${span}` },
                    });
                }),
            )}
        </div>
    );
}

export type { ComposedCardPlacement };

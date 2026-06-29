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
import type { CardCompositionPreference } from "@/lib/adminV2/runtime/focusPanel/cardCompositionModel";
import type { FocusPanelCardKey } from "@/lib/adminV2/runtime/focusPanel/focusPanelCardModel";

type Props = {
    rows: FocusPanelGridRow[];
    renderCell: (cellKey: string) => ReactNode;
    className?: string;
    dataFocusPanelSplitLayout?: string;
    /**
     * Composition Engine input. When provided, the surface is COMPOSED from card
     * semantics (interlocking lanes / composed stack) instead of the uniform grid.
     * The legacy `rows` path is kept for Work + other modes.
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
        if (!el || typeof ResizeObserver === "undefined") return;
        const ro = new ResizeObserver((entries) => {
            const width = entries[0]?.contentRect.width ?? el.clientWidth;
            setColumns(computeFocusPanelGridColumns(width));
            setWidthPx(width);
        });
        ro.observe(el);
        setColumns(computeFocusPanelGridColumns(el.clientWidth));
        setWidthPx(el.clientWidth);
        return () => ro.disconnect();
    }, []);

    const composition = useMemo(() => {
        if (!composed || widthPx <= 0) return null;
        return composeFocusPanelSurface({
            cards: composeCards!,
            availableWidthPx: widthPx,
            overrides: compositionOverrides,
        });
    }, [composed, composeCards, widthPx, compositionOverrides]);

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
            onClick={onBackdropClick}
        />
    ) : null;

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

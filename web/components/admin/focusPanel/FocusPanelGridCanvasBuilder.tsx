"use client";

import { useRef, useState, type PointerEvent, type ReactNode } from "react";

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
    defaultRowSpanForCard,
    moveArea,
    removeArea,
    resizeArea,
} from "@/lib/adminV2/runtime/focusPanel/composition/focusPanelGridLayoutOps";
import type { FocusPanelCardKey } from "@/lib/adminV2/runtime/focusPanel/focusPanelCardModel";

/**
 * Grid Canvas Builder (Experience Builder V5) — the responsive GRID authoring surface.
 *
 * The product no longer thinks in rows; it thinks in REGIONS. Each card occupies a
 * rectangle of a 12-column grid ({colStart,colSpan,rowStart,rowSpan}). The operator
 * works directly on the cards — drag to move (snaps to grid cells), drag the right edge
 * to span more columns, drag the bottom edge to span more rows (vertical spans), click to
 * select (the Inspector edits behavior). This authors the SAME published layout the
 * runtime renders with CSS Grid — builder and runtime are one grid. Composition only:
 * Evidence Groups, capability matrix, inspector, and runtime are unchanged.
 */

const ROW_UNIT_PX = 76; // uniform authoring track height (Power-BI-style snap rows)

type NestedSurfaceTarget = {
    surfaceId: string;
    surfaceLabel: string;
};

type Props = {
    initialGrid: FocusPanelGridLayout;
    catalog: { key: FocusPanelCardKey; label: string }[];
    renderCard: (key: FocusPanelCardKey) => ReactNode;
    /** Emits the full published layout (grid + derived reading-order rows) on every edit. */
    onChange?: (layout: FocusPanelPublishedLayout) => void;
    onSelectCard?: (key: FocusPanelCardKey) => void;
    selectedCard?: FocusPanelCardKey | null;
    /** Depth-bound nested surfaces reachable from each canvas card (registry-derived). */
    nestedSurfaceByCard?: Partial<Record<FocusPanelCardKey, NestedSurfaceTarget>>;
    /** Drill into a nested surface editor (same path as chip launchers). */
    onOpenNestedSurface?: (surfaceId: string) => void;
};

type Ghost = { colStart: number; colSpan: number; rowStart: number; rowSpan: number };

export default function FocusPanelGridCanvasBuilder({
    initialGrid,
    catalog,
    renderCard,
    onChange,
    onSelectCard,
    selectedCard,
    nestedSurfaceByCard,
    onOpenNestedSurface,
}: Props) {
    const [grid, setGrid] = useState<FocusPanelGridLayout>(initialGrid);
    const [ghost, setGhost] = useState<Ghost | null>(null);
    const surfaceRef = useRef<HTMLDivElement>(null);
    const interacting = useRef(false);

    const cols = grid.columns || FOCUS_PANEL_GRID_COLUMNS;
    const apply = (next: FocusPanelGridLayout) => {
        setGrid(next);
        onChange?.(buildPublishedLayoutFromGrid(next));
    };
    const placed = new Set(cardsInGrid(grid));
    const tray = catalog.filter((c) => !placed.has(c.key));
    const labelFor = (key: FocusPanelCardKey) => catalog.find((c) => c.key === key)?.label ?? key;
    const rowCount = Math.max(4, ...grid.areas.map((a) => a.rowStart + a.rowSpan - 1)) + 1;

    /** Pointer (clientX/Y) → 1-based grid cell, snapped + clamped to the surface. */
    const cellFromPointer = (clientX: number, clientY: number) => {
        const el = surfaceRef.current;
        if (!el) return { col: 1, row: 1 };
        const r = el.getBoundingClientRect();
        const colW = r.width / cols;
        const col = Math.min(cols, Math.max(1, Math.floor((clientX - r.left) / colW) + 1));
        const row = Math.max(1, Math.floor((clientY - r.top) / ROW_UNIT_PX) + 1);
        return { col, row };
    };

    // ── Move: drag a card; it snaps to the cell under the pointer ──
    const startMove = (e: PointerEvent, area: FocusPanelGridArea) => {
        if (interacting.current) return;
        interacting.current = true;
        e.preventDefault();
        const move = (ev: globalThis.PointerEvent) => {
            const { col, row } = cellFromPointer(ev.clientX, ev.clientY);
            const colStart = Math.min(col, cols - area.colSpan + 1);
            const next = clampArea(grid, { ...area, colStart, rowStart: row });
            setGhost({ colStart: next.colStart, colSpan: next.colSpan, rowStart: next.rowStart, rowSpan: next.rowSpan });
        };
        const up = (ev: globalThis.PointerEvent) => {
            const { col, row } = cellFromPointer(ev.clientX, ev.clientY);
            apply(moveArea(grid, area.card, Math.min(col, cols - area.colSpan + 1), row));
            setGhost(null);
            interacting.current = false;
            window.removeEventListener("pointermove", move);
            window.removeEventListener("pointerup", up);
        };
        window.addEventListener("pointermove", move);
        window.addEventListener("pointerup", up);
    };

    // ── Resize: right edge → colSpan, bottom edge → rowSpan, corner → both ──
    const startResize = (e: PointerEvent, area: FocusPanelGridArea, axis: "w" | "h" | "wh") => {
        if (interacting.current) return;
        interacting.current = true;
        e.preventDefault();
        e.stopPropagation();
        const el = surfaceRef.current;
        const move = (ev: globalThis.PointerEvent) => {
            if (!el) return;
            const r = el.getBoundingClientRect();
            const colW = r.width / cols;
            const colSpan = axis === "h" ? area.colSpan : Math.max(1, Math.round((ev.clientX - r.left) / colW) - area.colStart + 1);
            const rowSpan = axis === "w" ? area.rowSpan : Math.max(1, Math.round((ev.clientY - r.top) / ROW_UNIT_PX) - area.rowStart + 1);
            const next = clampArea(grid, { ...area, colSpan, rowSpan });
            setGhost({ colStart: next.colStart, colSpan: next.colSpan, rowStart: next.rowStart, rowSpan: next.rowSpan });
        };
        const up = (ev: globalThis.PointerEvent) => {
            if (el) {
                const r = el.getBoundingClientRect();
                const colW = r.width / cols;
                const colSpan = axis === "h" ? area.colSpan : Math.max(1, Math.round((ev.clientX - r.left) / colW) - area.colStart + 1);
                const rowSpan = axis === "w" ? area.rowSpan : Math.max(1, Math.round((ev.clientY - r.top) / ROW_UNIT_PX) - area.rowStart + 1);
                apply(resizeArea(grid, area.card, colSpan, rowSpan));
            }
            setGhost(null);
            interacting.current = false;
            window.removeEventListener("pointermove", move);
            window.removeEventListener("pointerup", up);
        };
        window.addEventListener("pointermove", move);
        window.addEventListener("pointerup", up);
    };

    // ── Tray → grid: drop an unplaced card at a cell (HTML5 DnD for tray chips) ──
    const onSurfaceDrop = (e: React.DragEvent) => {
        e.preventDefault();
        const card = e.dataTransfer.getData("text/card") as FocusPanelCardKey;
        if (!card) return;
        const { col, row } = cellFromPointer(e.clientX, e.clientY);
        const span = Math.min(6, cols); // half-width default
        const colStart = Math.min(col, cols - span + 1);
        // Open at the card's natural summary height (not a single min-height row).
        const withCard = addCardToGrid(grid, card, { colSpan: span, rowSpan: defaultRowSpanForCard(card) });
        apply(moveArea(withCard, card, colStart, row));
    };

    return (
        <div className="alloy-os-grid-builder" data-grid-builder="true">
            <div className="alloy-os-grid-builder__head">
                <span className="alloy-os-grid-builder__title">Arrange the Focus Panel</span>
                <span className="alloy-os-grid-builder__hint">Drag to move · drag the right/bottom edge to span columns/rows · click to configure</span>
            </div>

            <div
                ref={surfaceRef}
                className="alloy-os-grid-builder__surface"
                data-grid-surface="true"
                style={{ ["--cols" as string]: cols, ["--row-unit" as string]: `${ROW_UNIT_PX}px`, gridTemplateRows: `repeat(${rowCount}, ${ROW_UNIT_PX}px)` }}
                onDragOver={(e) => e.preventDefault()}
                onDrop={onSurfaceDrop}
            >
                {/* faint snap-grid overlay */}
                <div className="alloy-os-grid-builder__overlay" aria-hidden style={{ ["--cols" as string]: cols }}>
                    {Array.from({ length: cols * rowCount }).map((_, i) => (
                        // eslint-disable-next-line react/no-array-index-key
                        <span key={i} className="alloy-os-grid-builder__overlay-cell" />
                    ))}
                </div>

                {ghost ? (
                    <div
                        className="alloy-os-grid-builder__ghost"
                        style={{ gridColumn: `${ghost.colStart} / span ${ghost.colSpan}`, gridRow: `${ghost.rowStart} / span ${ghost.rowSpan}` }}
                    />
                ) : null}

                {grid.areas.map((area) => (
                    <div
                        key={area.card}
                        className={["alloy-os-grid-builder__area", selectedCard === area.card ? "is-selected" : ""].join(" ")}
                        data-grid-area={area.card}
                        data-grid-col={`${area.colStart}/${area.colSpan}`}
                        data-grid-row={`${area.rowStart}/${area.rowSpan}`}
                        style={{ gridColumn: `${area.colStart} / span ${area.colSpan}`, gridRow: `${area.rowStart} / span ${area.rowSpan}` }}
                        onClick={() => onSelectCard?.(area.card)}
                    >
                        <div
                            className="alloy-os-grid-builder__bar"
                            data-grid-move={area.card}
                            onPointerDown={(e) => startMove(e, area)}
                        >
                            <span className="alloy-os-grid-builder__grip" aria-hidden>⠿</span>
                            <span className="alloy-os-grid-builder__name">{labelFor(area.card)}</span>
                            <button
                                type="button"
                                className="alloy-os-grid-builder__remove"
                                data-grid-remove={area.card}
                                aria-label={`Remove ${labelFor(area.card)}`}
                                onClick={(e) => { e.stopPropagation(); apply(removeArea(grid, area.card)); }}
                            >
                                ✕
                            </button>
                        </div>
                        <div className="alloy-os-grid-builder__body">
                            {renderCard(area.card)}
                            {nestedSurfaceByCard?.[area.card] && onOpenNestedSurface ? (
                                <button
                                    type="button"
                                    className="mt-2 flex w-full items-center justify-end gap-1 rounded-md border border-dashed border-alloy-pine/30 bg-alloy-pine/[0.04] px-2 py-1.5 text-[11px] font-medium text-alloy-pine hover:border-alloy-pine/50 hover:bg-alloy-pine/[0.08]"
                                    data-nested-surface-affordance={area.card}
                                    data-open-nested-surface={nestedSurfaceByCard[area.card]!.surfaceId}
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        onOpenNestedSurface(nestedSurfaceByCard[area.card]!.surfaceId);
                                    }}
                                >
                                    Configure expansion →
                                    <span className="text-alloy-midnight/35">{nestedSurfaceByCard[area.card]!.surfaceLabel}</span>
                                </button>
                            ) : null}
                        </div>
                        <div className="alloy-os-grid-builder__handle alloy-os-grid-builder__handle--w" data-grid-resize-w={area.card} role="separator" aria-label="Span columns" onPointerDown={(e) => startResize(e, area, "w")} />
                        <div className="alloy-os-grid-builder__handle alloy-os-grid-builder__handle--h" data-grid-resize-h={area.card} role="separator" aria-label="Span rows" onPointerDown={(e) => startResize(e, area, "h")} />
                        <div className="alloy-os-grid-builder__handle alloy-os-grid-builder__handle--corner" data-grid-resize-corner={area.card} role="separator" aria-label="Span columns and rows" onPointerDown={(e) => startResize(e, area, "wh")} />
                    </div>
                ))}

                {grid.areas.length === 0 ? <p className="alloy-os-grid-builder__empty">Drag a card from the tray onto the grid.</p> : null}
            </div>

            {tray.length > 0 ? (
                <div className="alloy-os-grid-builder__tray" data-grid-tray="true">
                    <span className="alloy-os-grid-builder__tray-label">Cards</span>
                    {tray.map((c) => (
                        <div
                            key={c.key}
                            className="alloy-os-grid-builder__chip"
                            data-grid-tray-card={c.key}
                            draggable
                            onDragStart={(e) => e.dataTransfer.setData("text/card", c.key)}
                        >
                            {c.label}
                        </div>
                    ))}
                </div>
            ) : null}
        </div>
    );
}

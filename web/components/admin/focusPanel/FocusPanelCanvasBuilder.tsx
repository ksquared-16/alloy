"use client";

import { useRef, useState, type DragEvent, type PointerEvent, type ReactNode } from "react";

import {
    CELL_HEIGHT_PX,
    FOCUS_PANEL_CELL_HEIGHTS,
    resolveRowUnits,
    snapWidthFromFraction,
    type FocusPanelCellHeight,
    type FocusPanelPublishedLayout,
} from "@/lib/adminV2/runtime/focusPanel/composition/focusPanelPublishedLayout";
import {
    addCardToRow,
    addRow,
    cardsInLayout,
    moveCardOntoCell,
    moveCardToNewRow,
    moveCardToRowByCard,
    removeCard,
    setCellHeight,
    setCellWidth,
    type CardLocation,
} from "@/lib/adminV2/runtime/focusPanel/composition/focusPanelPublishedLayoutOps";
import type { FocusPanelCardKey } from "@/lib/adminV2/runtime/focusPanel/focusPanelCardModel";

/**
 * Canvas Builder (Experience Builder V4) — the Focus Panel CANVAS itself is the editor.
 *
 * The operator works directly on the cards: click to select (the Inspector edits its
 * behavior), drag to reorder / move between rows / stack, and drag the right edge to make
 * a card wider/narrower or the bottom edge to give it more/less room. There is no
 * separate "compose layout" control panel — composition is direct manipulation.
 *
 * The CANVAS owns composition (position / width / height / stacking / row). The INSPECTOR
 * owns behavior (question / evidence groups / editing / expanded / related / actions /
 * conditions / AI / ownership). Resizing never changes a card's question, ownership,
 * editability, or related views — same card, more room. The runtime solves spacing
 * (named width snaps + Fill), so rows stay composed with no dead whitespace.
 */

type DragItem = { card: FocusPanelCardKey; fromPalette: boolean };

type Props = {
    initialLayout: FocusPanelPublishedLayout;
    catalog: { key: FocusPanelCardKey; label: string }[];
    renderCard: (key: FocusPanelCardKey) => ReactNode;
    /** Notified on every composition edit (host persists via its draft/publish path). */
    onChange?: (layout: FocusPanelPublishedLayout) => void;
    /** Selecting a card opens the Inspector (behavior) — composition stays on the canvas. */
    onSelectCard?: (key: FocusPanelCardKey) => void;
    selectedCard?: FocusPanelCardKey | null;
};

const HEIGHT_LABEL: Record<FocusPanelCellHeight, string> = { compact: "Compact", standard: "Standard", tall: "Tall" };

export default function FocusPanelCanvasBuilder({ initialLayout, catalog, renderCard, onChange, onSelectCard, selectedCard }: Props) {
    const [layout, setLayout] = useState<FocusPanelPublishedLayout>(initialLayout);
    const [drag, setDrag] = useState<DragItem | null>(null);
    const [dropRow, setDropRow] = useState<number | null>(null);
    const resizing = useRef(false);

    const apply = (next: FocusPanelPublishedLayout) => {
        setLayout(next);
        onChange?.(next);
    };

    const placed = new Set(cardsInLayout(layout));
    const palette = catalog.filter((c) => !placed.has(c.key));
    const labelFor = (key: FocusPanelCardKey) => catalog.find((c) => c.key === key)?.label ?? key;

    // ── Drag-and-drop: reorder · move between rows · stack ──
    const onDropRow = (rowIndex: number) => {
        if (!drag) return;
        apply(drag.fromPalette ? addCardToRow(layout, rowIndex, drag.card) : moveCardToRowByCard(layout, drag.card, rowIndex));
        setDrag(null);
        setDropRow(null);
    };
    const onDropCard = (targetCard: FocusPanelCardKey) => {
        if (!drag || drag.card === targetCard) return;
        if (drag.fromPalette) {
            // Palette cards land in the target's row; stacking is for already-placed cards.
            const target = layout.rows.findIndex((r) => r.cells.some((c) => c.cards.includes(targetCard)));
            apply(addCardToRow(layout, target < 0 ? layout.rows.length - 1 : target, drag.card));
        } else {
            apply(moveCardOntoCell(layout, drag.card, targetCard));
        }
        setDrag(null);
        setDropRow(null);
    };
    const onDropNewRow = (atIndex: number) => {
        if (!drag) return;
        apply(drag.fromPalette ? addCardToRow(addRow(layout, atIndex), atIndex, drag.card) : moveCardToNewRow(layout, drag.card, atIndex));
        setDrag(null);
        setDropRow(null);
    };

    // ── Direct width resize: drag the right edge (snaps to a named width) ──
    const startWidthResize = (e: PointerEvent, loc: CardLocation, cellEl: HTMLElement) => {
        e.preventDefault();
        e.stopPropagation();
        resizing.current = true;
        const rowEl = cellEl.closest("[data-canvas-row]") as HTMLElement | null;
        if (!rowEl) return;
        const base = layout;
        const rowWidth = rowEl.getBoundingClientRect().width;
        const cellLeft = cellEl.getBoundingClientRect().left;
        const move = (ev: globalThis.PointerEvent) => {
            const fraction = Math.min(1, Math.max(0.2, (ev.clientX - cellLeft) / rowWidth));
            apply(setCellWidth(base, loc.row, loc.cell, snapWidthFromFraction(fraction)));
        };
        const up = () => {
            resizing.current = false;
            window.removeEventListener("pointermove", move);
            window.removeEventListener("pointerup", up);
        };
        window.addEventListener("pointermove", move);
        window.addEventListener("pointerup", up);
    };

    // ── Direct height resize: drag the bottom edge (snaps to compact/standard/tall) ──
    const startHeightResize = (e: PointerEvent, loc: CardLocation, cellEl: HTMLElement) => {
        e.preventDefault();
        e.stopPropagation();
        resizing.current = true;
        const base = layout;
        const cellTop = cellEl.getBoundingClientRect().top;
        const move = (ev: globalThis.PointerEvent) => {
            const px = ev.clientY - cellTop;
            let best: FocusPanelCellHeight = "standard";
            let bestDist = Infinity;
            for (const h of FOCUS_PANEL_CELL_HEIGHTS) {
                const dist = Math.abs(CELL_HEIGHT_PX[h] - px);
                if (dist < bestDist) {
                    bestDist = dist;
                    best = h;
                }
            }
            apply(setCellHeight(base, loc.row, loc.cell, best));
        };
        const up = () => {
            resizing.current = false;
            window.removeEventListener("pointermove", move);
            window.removeEventListener("pointerup", up);
        };
        window.addEventListener("pointermove", move);
        window.addEventListener("pointerup", up);
    };

    return (
        <div className="alloy-os-canvas-builder" data-canvas-builder="true">
            <div className="alloy-os-canvas-builder__head">
                <span className="alloy-os-canvas-builder__title">Arrange the Focus Panel</span>
                <span className="alloy-os-canvas-builder__hint">Drag to move · drag the edges to resize · click a card to configure it</span>
            </div>

            <div className="alloy-os-canvas-builder__canvas">
                <DropStrip first onDrop={() => onDropNewRow(0)} active={drag != null} />
                {layout.rows.map((row, rowIndex) => {
                    const units = resolveRowUnits(row.cells);
                    return (
                        <div key={rowIndex} className="alloy-os-canvas-builder__rowwrap">
                            <div
                                className={["alloy-os-canvas-builder__row", dropRow === rowIndex ? "is-drop" : ""].join(" ")}
                                data-canvas-row={rowIndex}
                                onDragOver={(e: DragEvent) => {
                                    e.preventDefault();
                                    setDropRow(rowIndex);
                                }}
                                onDragLeave={() => setDropRow((r) => (r === rowIndex ? null : r))}
                                onDrop={() => onDropRow(rowIndex)}
                            >
                                {row.cells.map((cell, cellIndex) => (
                                    <div
                                        key={cellIndex}
                                        className="alloy-os-canvas-builder__cell"
                                        data-canvas-cell={`${rowIndex}.${cellIndex}`}
                                        data-cell-width={cell.width}
                                        data-cell-height={cell.height ?? "auto"}
                                        style={{ flexGrow: units[cellIndex] ?? 1, flexShrink: 1, flexBasis: 0, minHeight: cell.height ? CELL_HEIGHT_PX[cell.height] : undefined }}
                                    >
                                        {cell.cards.map((card) => (
                                            <CardTile
                                                key={card}
                                                card={card}
                                                label={labelFor(card)}
                                                selected={selectedCard === card}
                                                onDragStart={() => setDrag({ card, fromPalette: false })}
                                                onDragEnd={() => setDrag(null)}
                                                onDropOnCard={() => onDropCard(card)}
                                                onSelect={() => onSelectCard?.(card)}
                                                onRemove={() => apply(removeCard(layout, { row: rowIndex, cell: cellIndex, card }))}
                                                onResizeWidth={(e, el) => startWidthResize(e, { row: rowIndex, cell: cellIndex, card }, el)}
                                                onResizeHeight={(e, el) => startHeightResize(e, { row: rowIndex, cell: cellIndex, card }, el)}
                                            >
                                                {renderCard(card)}
                                            </CardTile>
                                        ))}
                                    </div>
                                ))}
                            </div>
                        </div>
                    );
                })}
                <DropStrip onDrop={() => onDropNewRow(layout.rows.length)} active={drag != null} label="Drop here for a new row" />
                {layout.rows.length === 0 ? <p className="alloy-os-canvas-builder__empty">Drag a card from the tray below onto the canvas.</p> : null}
            </div>

            {palette.length > 0 ? (
                <div className="alloy-os-canvas-builder__tray" data-canvas-tray="true">
                    <span className="alloy-os-canvas-builder__tray-label">Cards</span>
                    {palette.map((c) => (
                        <div
                            key={c.key}
                            className="alloy-os-canvas-builder__chip"
                            data-canvas-palette-card={c.key}
                            draggable
                            onDragStart={() => setDrag({ card: c.key, fromPalette: true })}
                            onDragEnd={() => setDrag(null)}
                        >
                            {c.label}
                        </div>
                    ))}
                </div>
            ) : null}
        </div>
    );
}

function DropStrip({ onDrop, active, first, label }: { onDrop: () => void; active: boolean; first?: boolean; label?: string }) {
    const [over, setOver] = useState(false);
    return (
        <div
            className={["alloy-os-canvas-builder__dropstrip", first ? "is-first" : "", active ? "is-active" : "", over ? "is-over" : ""].join(" ")}
            data-canvas-new-row={first ? "0" : "end"}
            onDragOver={(e: DragEvent) => {
                e.preventDefault();
                setOver(true);
            }}
            onDragLeave={() => setOver(false)}
            onDrop={() => {
                setOver(false);
                onDrop();
            }}
        >
            {active && label ? <span>{label}</span> : null}
        </div>
    );
}

function CardTile({
    card,
    label,
    selected,
    children,
    onDragStart,
    onDragEnd,
    onDropOnCard,
    onSelect,
    onRemove,
    onResizeWidth,
    onResizeHeight,
}: {
    card: FocusPanelCardKey;
    label: string;
    selected: boolean;
    children: ReactNode;
    onDragStart: () => void;
    onDragEnd: () => void;
    onDropOnCard: () => void;
    onSelect: () => void;
    onRemove: () => void;
    onResizeWidth: (e: PointerEvent, el: HTMLElement) => void;
    onResizeHeight: (e: PointerEvent, el: HTMLElement) => void;
}) {
    const ref = useRef<HTMLDivElement>(null);
    return (
        <div
            ref={ref}
            className={["alloy-os-canvas-builder__tile", selected ? "is-selected" : ""].join(" ")}
            data-canvas-card={card}
            data-canvas-selected={selected ? "true" : undefined}
            draggable
            onDragStart={onDragStart}
            onDragEnd={onDragEnd}
            onDragOver={(e: DragEvent) => e.preventDefault()}
            onDrop={(e: DragEvent) => {
                e.stopPropagation();
                onDropOnCard();
            }}
            onClick={() => onSelect()}
        >
            <div className="alloy-os-canvas-builder__tile-bar">
                <span className="alloy-os-canvas-builder__grip" aria-hidden>⠿</span>
                <span className="alloy-os-canvas-builder__tile-name">{label}</span>
                <button type="button" className="alloy-os-canvas-builder__remove" aria-label={`Remove ${label}`} data-canvas-remove={card} onClick={(e) => { e.stopPropagation(); onRemove(); }}>✕</button>
            </div>
            <div className="alloy-os-canvas-builder__tile-body">{children}</div>
            <div
                className="alloy-os-canvas-builder__handle alloy-os-canvas-builder__handle--w"
                data-canvas-resize-w={card}
                role="separator"
                aria-label={`Resize ${label} width`}
                onPointerDown={(e) => ref.current && onResizeWidth(e, ref.current)}
            />
            <div
                className="alloy-os-canvas-builder__handle alloy-os-canvas-builder__handle--h"
                data-canvas-resize-h={card}
                role="separator"
                aria-label={`Resize ${label} height`}
                onPointerDown={(e) => ref.current && onResizeHeight(e, ref.current)}
            />
        </div>
    );
}

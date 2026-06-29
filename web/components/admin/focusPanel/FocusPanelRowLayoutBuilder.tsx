"use client";

import { useMemo, useState, type DragEvent, type ReactNode } from "react";

import FocusPanelCardGrid from "@/components/admin/focusPanel/FocusPanelCardGrid";
import type { FocusPanelCardKey } from "@/lib/adminV2/runtime/focusPanel/focusPanelCardModel";
import {
    FOCUS_PANEL_CELL_WIDTHS,
    type FocusPanelCellWidth,
    type FocusPanelPublishedLayout,
} from "@/lib/adminV2/runtime/focusPanel/composition/focusPanelPublishedLayout";
import {
    addCardToRow,
    addRow,
    cardsInLayout,
    moveCardToRow,
    removeCard,
    setCellWidth,
    stackCardInCell,
    type CardLocation,
} from "@/lib/adminV2/runtime/focusPanel/composition/focusPanelPublishedLayoutOps";

/**
 * Row-based Experience Builder — compose the Focus Panel VISUALLY with rows and
 * columns, not abstract tokens. The operator adds rows, drops cards into them, and
 * sets each card's width with plain fractions (Full / 1/2 / 1/3 / 2/3). Stacking two
 * cards in one column makes the "Household left, Readiness + Current Work stacked
 * right" pattern. The preview is the REAL runtime grid fed the same published layout,
 * so what you see is what publishes. Internal weight/partner logic is only the
 * default fallback when nothing is published.
 */

const WIDTH_LABEL: Record<FocusPanelCellWidth, string> = {
    full: "Full",
    "1/2": "1/2",
    "1/3": "1/3",
    "2/3": "2/3",
};

type Props = {
    initialLayout: FocusPanelPublishedLayout;
    /** Card catalog: operator-facing names. */
    catalog: { key: FocusPanelCardKey; label: string }[];
    /** Render a card for the live preview (the real card components). */
    renderCard: (key: FocusPanelCardKey) => ReactNode;
    /** Notified on every layout edit (host tracks it for its own save/publish path). */
    onChange?: (layout: FocusPanelPublishedLayout) => void;
    /** Optional self-contained publish (dev harness). When absent the host owns publish. */
    onPublish?: (layout: FocusPanelPublishedLayout) => void;
};

export default function FocusPanelRowLayoutBuilder({ initialLayout, catalog, renderCard, onChange, onPublish }: Props) {
    const [layout, setLayout] = useState<FocusPanelPublishedLayout>(initialLayout);
    const [dragging, setDragging] = useState<CardLocation | null>(null);
    const [published, setPublished] = useState(false);

    const placed = useMemo(() => new Set(cardsInLayout(layout)), [layout]);
    const available = catalog.filter((c) => !placed.has(c.key));
    const labelFor = (key: FocusPanelCardKey) => catalog.find((c) => c.key === key)?.label ?? key;

    const apply = (next: FocusPanelPublishedLayout) => {
        setLayout(next);
        setPublished(false);
        onChange?.(next);
    };

    return (
        <div className="alloy-os-rlb" data-row-layout-builder="true">
            {/* ── Controls ── */}
            <div className="alloy-os-rlb__controls">
                <div className="alloy-os-rlb__controls-head">
                    <span className="alloy-os-rlb__title">Compose layout</span>
                    <div className="alloy-os-rlb__head-actions">
                        <button type="button" className="alloy-os-rlb__btn" data-builder-add-row onClick={() => apply(addRow(layout))}>
                            + Add row
                        </button>
                        {onPublish ? (
                            <button
                                type="button"
                                className="alloy-os-rlb__btn alloy-os-rlb__btn--primary"
                                data-builder-publish
                                onClick={() => {
                                    onPublish(layout);
                                    setPublished(true);
                                }}
                            >
                                {published ? "✓ Published" : "Publish"}
                            </button>
                        ) : null}
                    </div>
                </div>

                {layout.rows.length === 0 ? (
                    <p className="alloy-os-rlb__empty">No rows yet — add a row, then drop cards into it.</p>
                ) : null}

                {layout.rows.map((row, rowIndex) => (
                    <div
                        key={rowIndex}
                        className="alloy-os-rlb__row"
                        data-builder-row={rowIndex}
                        onDragOver={(e: DragEvent) => e.preventDefault()}
                        onDrop={() => {
                            if (dragging) apply(moveCardToRow(layout, dragging, rowIndex));
                            setDragging(null);
                        }}
                    >
                        <div className="alloy-os-rlb__row-head">
                            <span className="alloy-os-rlb__row-label">Row {rowIndex + 1}</span>
                        </div>
                        <div className="alloy-os-rlb__cells">
                            {row.cells.map((cell, cellIndex) =>
                                cell.cards.map((card, cardIndex) => (
                                    <div
                                        key={card}
                                        className="alloy-os-rlb__cell"
                                        data-builder-cell={`${rowIndex}.${cellIndex}`}
                                        data-builder-card={card}
                                        data-cell-width={cell.width}
                                        draggable
                                        onDragStart={() => setDragging({ row: rowIndex, cell: cellIndex, card })}
                                        onDragEnd={() => setDragging(null)}
                                    >
                                        <div className="alloy-os-rlb__cell-head">
                                            <span className="alloy-os-rlb__cell-name">{labelFor(card)}</span>
                                            <button
                                                type="button"
                                                className="alloy-os-rlb__remove"
                                                aria-label={`Remove ${labelFor(card)}`}
                                                onClick={() => apply(removeCard(layout, { row: rowIndex, cell: cellIndex, card }))}
                                            >
                                                ✕
                                            </button>
                                        </div>
                                        {/* Width controls only on the first card of a cell (the cell owns the width). */}
                                        {cardIndex === 0 ? (
                                            <div className="alloy-os-rlb__widths" role="group" aria-label="Card width">
                                                {FOCUS_PANEL_CELL_WIDTHS.map((w) => (
                                                    <button
                                                        key={w}
                                                        type="button"
                                                        className={[
                                                            "alloy-os-rlb__width",
                                                            cell.width === w ? "alloy-os-rlb__width--active" : "",
                                                        ].join(" ")}
                                                        data-width-btn={w}
                                                        aria-pressed={cell.width === w}
                                                        onClick={() => apply(setCellWidth(layout, rowIndex, cellIndex, w))}
                                                    >
                                                        {WIDTH_LABEL[w]}
                                                    </button>
                                                ))}
                                            </div>
                                        ) : (
                                            <span className="alloy-os-rlb__stacked-note">stacked</span>
                                        )}
                                    </div>
                                )),
                            )}
                            {/* Add a card into this row (as a new column), or stack into the last cell. */}
                            {available.length > 0 ? (
                                <details className="alloy-os-rlb__add-card">
                                    <summary className="alloy-os-rlb__btn alloy-os-rlb__btn--ghost">+ Card</summary>
                                    <div className="alloy-os-rlb__add-menu">
                                        {available.map((c) => (
                                            <div key={c.key} className="alloy-os-rlb__add-row-item">
                                                <button
                                                    type="button"
                                                    className="alloy-os-rlb__add-btn"
                                                    data-builder-add-card={c.key}
                                                    onClick={() => apply(addCardToRow(layout, rowIndex, c.key))}
                                                >
                                                    {c.label}
                                                </button>
                                                {row.cells.length > 0 ? (
                                                    <button
                                                        type="button"
                                                        className="alloy-os-rlb__stack-btn"
                                                        title={`Stack ${c.label} under the last column`}
                                                        data-builder-stack-card={c.key}
                                                        onClick={() => apply(stackCardInCell(layout, rowIndex, row.cells.length - 1, c.key))}
                                                    >
                                                        ↓ stack
                                                    </button>
                                                ) : null}
                                            </div>
                                        ))}
                                    </div>
                                </details>
                            ) : null}
                        </div>
                    </div>
                ))}
            </div>

            {/* ── Live preview = the real runtime grid fed this published layout ── */}
            <div className="alloy-os-rlb__preview" data-builder-preview="true">
                <span className="alloy-os-rlb__preview-label">Preview · matches published runtime</span>
                <div className="alloy-os-rlb__preview-canvas">
                    {layout.rows.length > 0 ? (
                        <FocusPanelCardGrid rows={[]} publishedLayout={layout} renderCell={(key) => renderCard(key as FocusPanelCardKey)} />
                    ) : (
                        <p className="alloy-os-rlb__empty">Add rows and cards to preview the layout.</p>
                    )}
                </div>
            </div>
        </div>
    );
}

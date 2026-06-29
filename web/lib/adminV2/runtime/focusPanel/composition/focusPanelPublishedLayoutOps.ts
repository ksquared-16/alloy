/**
 * Pure operations for the row-based Experience Builder.
 *
 * The builder edits a `FocusPanelPublishedLayout` (rows → cells → stacked cards,
 * each cell a fractional width) — the operator-authored composition the runtime
 * honors exactly (see focusPanelPublishedLayout.ts). These helpers are pure and
 * testable; the builder component wires them to UI; publish writes the layout into
 * the doc metadata the runtime reads.
 */

import type { FocusPanelCardKey } from "@/lib/adminV2/runtime/focusPanel/focusPanelCardModel";
import {
    FOCUS_PANEL_PUBLISHED_LAYOUT_META_KEY,
    type FocusPanelCellWidth,
    type FocusPanelLayoutCell,
    type FocusPanelPublishedLayout,
} from "@/lib/adminV2/runtime/focusPanel/composition/focusPanelPublishedLayout";

/** Location of a single card inside a layout (for moves / removes). */
export type CardLocation = { row: number; cell: number; card: FocusPanelCardKey };

export function emptyLayout(): FocusPanelPublishedLayout {
    return { rows: [] };
}

/** Every card placed in the layout (reading order), for the catalog "already placed" state. */
export function cardsInLayout(layout: FocusPanelPublishedLayout): FocusPanelCardKey[] {
    return layout.rows.flatMap((r) => r.cells.flatMap((c) => c.cards));
}

/** Append an empty row (with a single full-width cell awaiting a card), or insert at index. */
export function addRow(layout: FocusPanelPublishedLayout, atIndex?: number): FocusPanelPublishedLayout {
    const rows = layout.rows.slice();
    const blank = { cells: [] as FocusPanelLayoutCell[] };
    const at = atIndex == null ? rows.length : Math.max(0, Math.min(atIndex, rows.length));
    rows.splice(at, 0, blank);
    return { rows };
}

/** Drop rows left empty (no cells / no cards) so the layout stays clean. */
function prune(layout: FocusPanelPublishedLayout): FocusPanelPublishedLayout {
    return {
        rows: layout.rows
            .map((r) => ({ cells: r.cells.filter((c) => c.cards.length > 0) }))
            .filter((r) => r.cells.length > 0),
    };
}

/** Add a card as a NEW cell at the end of a row (default half width). */
export function addCardToRow(
    layout: FocusPanelPublishedLayout,
    rowIndex: number,
    card: FocusPanelCardKey,
    width: FocusPanelCellWidth = "1/2",
): FocusPanelPublishedLayout {
    if (cardsInLayout(layout).includes(card)) return layout; // a card appears once
    const rows = layout.rows.map((r, i) =>
        i === rowIndex ? { cells: [...r.cells, { width, cards: [card] }] } : r,
    );
    return rows[rowIndex] ? { rows } : layout;
}

/** Stack a card vertically INSIDE an existing cell (e.g. Readiness + Current Work). */
export function stackCardInCell(
    layout: FocusPanelPublishedLayout,
    rowIndex: number,
    cellIndex: number,
    card: FocusPanelCardKey,
): FocusPanelPublishedLayout {
    if (cardsInLayout(layout).includes(card)) return layout;
    const rows = layout.rows.map((r, ri) =>
        ri === rowIndex
            ? { cells: r.cells.map((c, ci) => (ci === cellIndex ? { ...c, cards: [...c.cards, card] } : c)) }
            : r,
    );
    return { rows };
}

/** Set a cell's fractional width (Full / 1/2 / 1/3 / 2/3). */
export function setCellWidth(
    layout: FocusPanelPublishedLayout,
    rowIndex: number,
    cellIndex: number,
    width: FocusPanelCellWidth,
): FocusPanelPublishedLayout {
    const rows = layout.rows.map((r, ri) =>
        ri === rowIndex
            ? { cells: r.cells.map((c, ci) => (ci === cellIndex ? { ...c, width } : c)) }
            : r,
    );
    return { rows };
}

/** Remove a card; prunes the emptied cell / row. */
export function removeCard(layout: FocusPanelPublishedLayout, loc: CardLocation): FocusPanelPublishedLayout {
    const rows = layout.rows.map((r, ri) =>
        ri === loc.row
            ? { cells: r.cells.map((c, ci) => (ci === loc.cell ? { ...c, cards: c.cards.filter((x) => x !== loc.card) } : c)) }
            : r,
    );
    return prune({ rows });
}

/**
 * Move a card to another row — as a new cell (keeping its current width). Used by
 * drag-between-rows. Targets the end of the destination row; no-op if same row.
 */
export function moveCardToRow(
    layout: FocusPanelPublishedLayout,
    loc: CardLocation,
    toRowIndex: number,
): FocusPanelPublishedLayout {
    if (loc.row === toRowIndex) return layout;
    const sourceCell = layout.rows[loc.row]?.cells[loc.cell];
    const width = sourceCell?.width ?? "1/2";
    const removed = removeCard(layout, loc);
    // toRowIndex refers to the ORIGINAL indexing; clamp into the pruned layout.
    const target = Math.max(0, Math.min(toRowIndex, removed.rows.length - 1));
    if (!removed.rows[target]) return removed;
    const rows = removed.rows.map((r, i) =>
        i === target ? { cells: [...r.cells, { width, cards: [loc.card] }] } : r,
    );
    return rows[target] ? { rows } : removed;
}

/** Serialize the layout onto a doc's metadata so the runtime reads it. Pure. */
export function withPublishedLayoutMetadata(
    metadata: Record<string, unknown> | null | undefined,
    layout: FocusPanelPublishedLayout,
): Record<string, unknown> {
    return { ...(metadata ?? {}), [FOCUS_PANEL_PUBLISHED_LAYOUT_META_KEY]: prune(layout) };
}

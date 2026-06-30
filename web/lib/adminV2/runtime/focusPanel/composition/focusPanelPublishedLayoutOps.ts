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
    type FocusPanelCellHeight,
    type FocusPanelCellWidth,
    type FocusPanelLayoutCell,
    type FocusPanelPublishedLayout,
} from "@/lib/adminV2/runtime/focusPanel/composition/focusPanelPublishedLayout";

/** Location of a single card inside a layout (for moves / removes). */
export type CardLocation = { row: number; cell: number; card: FocusPanelCardKey };

export function emptyLayout(): FocusPanelPublishedLayout {
    return { rows: [] };
}

/**
 * A sensible starting layout from the present cards: pairs per row at 1/2 width, a
 * trailing odd card full-width. Only a STARTING POINT shown in the builder — until
 * the operator publishes, the runtime keeps its auto-composition default.
 */
export function defaultRowLayoutFromCards(cards: FocusPanelCardKey[]): FocusPanelPublishedLayout {
    const unique = [...new Set(cards)];
    const rows: { cells: FocusPanelLayoutCell[] }[] = [];
    for (let i = 0; i < unique.length; i += 2) {
        const pair = unique.slice(i, i + 2);
        rows.push({
            cells:
                pair.length === 2
                    ? [
                          { width: "half", cards: [pair[0]!] },
                          { width: "half", cards: [pair[1]!] },
                      ]
                    : [{ width: "full", cards: [pair[0]!] }],
        });
    }
    return { rows };
}

/** Every card placed in the layout (reading order), for the catalog "already placed" state. */
export function cardsInLayout(layout: FocusPanelPublishedLayout): FocusPanelCardKey[] {
    return layout.rows.flatMap((r) => r.cells.flatMap((c) => c.cards));
}

/** Find a card's location by identity (index-safe for canvas drag operations). */
export function locateCard(layout: FocusPanelPublishedLayout, card: FocusPanelCardKey): CardLocation | null {
    for (let row = 0; row < layout.rows.length; row += 1) {
        const cells = layout.rows[row]!.cells;
        for (let cell = 0; cell < cells.length; cell += 1) {
            if (cells[cell]!.cards.includes(card)) return { row, cell, card };
        }
    }
    return null;
}

/** Move a card (by identity) to STACK under a target card's cell — canvas drop-on-card. */
export function moveCardOntoCell(
    layout: FocusPanelPublishedLayout,
    card: FocusPanelCardKey,
    targetCard: FocusPanelCardKey,
): FocusPanelPublishedLayout {
    if (card === targetCard) return layout;
    const source = locateCard(layout, card);
    if (!source) return layout;
    const removed = removeCard(layout, source);
    const target = locateCard(removed, targetCard); // re-locate after prune
    if (!target) return layout;
    return stackCardInCell(removed, target.row, target.cell, card);
}

/** Move a card (by identity) to the end of a row — canvas drop-on-row. */
export function moveCardToRowByCard(
    layout: FocusPanelPublishedLayout,
    card: FocusPanelCardKey,
    toRowIndex: number,
): FocusPanelPublishedLayout {
    const source = locateCard(layout, card);
    if (!source) return layout;
    return moveCardToRow(layout, source, toRowIndex);
}

/**
 * Move a card (by identity) into a NEW row inserted at `atIndex` — canvas drop on a
 * between-rows strip. Done atomically (remove → splice) so the new row survives the
 * pruning that `moveCardToRow` would apply to an empty row.
 */
export function moveCardToNewRow(
    layout: FocusPanelPublishedLayout,
    card: FocusPanelCardKey,
    atIndex: number,
): FocusPanelPublishedLayout {
    const source = locateCard(layout, card);
    if (!source) return layout;
    const width = layout.rows[source.row]?.cells[source.cell]?.width ?? "half";
    const removed = removeCard(layout, source); // prunes emptied source cell/row
    const rows = removed.rows.slice();
    const at = Math.max(0, Math.min(atIndex, rows.length));
    rows.splice(at, 0, { cells: [{ width, cards: [card] }] });
    return { rows };
}

/** Append an empty row (with a single full-width cell awaiting a card), or insert at index. */
export function addRow(layout: FocusPanelPublishedLayout, atIndex?: number): FocusPanelPublishedLayout {
    const rows = layout.rows.slice();
    const blank = { cells: [] as FocusPanelLayoutCell[] };
    const at = atIndex == null ? rows.length : Math.max(0, Math.min(atIndex, rows.length));
    rows.splice(at, 0, blank);
    return { rows };
}

/** Remove an entire row (and the cards in it return to the catalog). */
export function removeRow(layout: FocusPanelPublishedLayout, rowIndex: number): FocusPanelPublishedLayout {
    if (!layout.rows[rowIndex]) return layout;
    return { rows: layout.rows.filter((_, i) => i !== rowIndex) };
}

/** Reorder a row up (−1) or down (+1) — the builder's Reorder Rows affordance. */
export function moveRow(
    layout: FocusPanelPublishedLayout,
    rowIndex: number,
    direction: -1 | 1,
): FocusPanelPublishedLayout {
    const target = rowIndex + direction;
    if (!layout.rows[rowIndex] || target < 0 || target >= layout.rows.length) return layout;
    const rows = layout.rows.slice();
    const [moved] = rows.splice(rowIndex, 1);
    rows.splice(target, 0, moved!);
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
    width: FocusPanelCellWidth = "half",
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

/** Set a cell's HEIGHT (room before expansion) — the canvas bottom-edge drag. */
export function setCellHeight(
    layout: FocusPanelPublishedLayout,
    rowIndex: number,
    cellIndex: number,
    height: FocusPanelCellHeight,
): FocusPanelPublishedLayout {
    const rows = layout.rows.map((r, ri) =>
        ri === rowIndex
            ? { cells: r.cells.map((c, ci) => (ci === cellIndex ? { ...c, height } : c)) }
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
    const width = sourceCell?.width ?? "half";
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

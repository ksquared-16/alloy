/**
 * Experience Builder V5 — responsive GRID authoring operations (pure, server-safe).
 *
 * The builder authors a `FocusPanelGridLayout` (cards placed as {colStart,colSpan,
 * rowStart,rowSpan} regions on an N-column grid). These ops snap/clamp to the grid and
 * keep a derived reading-order `rows` representation so every legacy consumer of the
 * published layout still works. The runtime renders the grid directly (CSS Grid).
 *
 * @see focusPanelPublishedLayout.ts (model + planner) · docs/platform/operator/experience-builder-doctrine.md
 */

import type { FocusPanelCardKey } from "@/lib/adminV2/runtime/focusPanel/focusPanelCardModel";
import {
    FOCUS_PANEL_GRID_COLUMNS,
    gridAreasInReadingOrder,
    resolveRowUnits,
    type FocusPanelCellHeight,
    type FocusPanelGridArea,
    type FocusPanelGridLayout,
    type FocusPanelPublishedLayout,
} from "@/lib/adminV2/runtime/focusPanel/composition/focusPanelPublishedLayout";

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

/** An empty grid on the given track count (default 12). */
export function emptyGridLayout(columns: number = FOCUS_PANEL_GRID_COLUMNS): FocusPanelGridLayout {
    return { columns, areas: [] };
}

/** The cards currently placed on the grid, in reading order. */
export function cardsInGrid(grid: FocusPanelGridLayout): FocusPanelCardKey[] {
    return gridAreasInReadingOrder(grid).map((a) => a.card);
}

export function findArea(grid: FocusPanelGridLayout, card: FocusPanelCardKey): FocusPanelGridArea | undefined {
    return grid.areas.find((a) => a.card === card);
}

/** Snap + clamp an area so it sits fully inside the grid (colStart/colSpan within columns). */
export function clampArea(grid: FocusPanelGridLayout, area: FocusPanelGridArea): FocusPanelGridArea {
    const colSpan = clamp(Math.round(area.colSpan), 1, grid.columns);
    const colStart = clamp(Math.round(area.colStart), 1, grid.columns - colSpan + 1);
    const rowSpan = Math.max(1, Math.round(area.rowSpan));
    const rowStart = Math.max(1, Math.round(area.rowStart));
    return { ...area, colStart, colSpan, rowStart, rowSpan };
}

/** The first row index with no placed area (so a newly-added card lands in free space). */
export function nextFreeRow(grid: FocusPanelGridLayout): number {
    if (grid.areas.length === 0) return 1;
    return Math.max(...grid.areas.map((a) => a.rowStart + a.rowSpan - 1)) + 1;
}

/** Place (or replace) a card's region. Snaps/clamps to the grid. PURE. */
export function placeArea(grid: FocusPanelGridLayout, area: FocusPanelGridArea): FocusPanelGridLayout {
    const next = clampArea(grid, area);
    const areas = [...grid.areas.filter((a) => a.card !== area.card), next];
    return { ...grid, areas };
}

/** Add a card as a full-width region on the next free row (default span). PURE. */
export function addCardToGrid(
    grid: FocusPanelGridLayout,
    card: FocusPanelCardKey,
    opts?: { colSpan?: number; rowSpan?: number },
): FocusPanelGridLayout {
    if (findArea(grid, card)) return grid;
    return placeArea(grid, {
        card,
        colStart: 1,
        colSpan: opts?.colSpan ?? grid.columns,
        rowStart: nextFreeRow(grid),
        rowSpan: opts?.rowSpan ?? 1,
    });
}

/** Move a card's region to a new top-left cell (snap/clamp). PURE. */
export function moveArea(
    grid: FocusPanelGridLayout,
    card: FocusPanelCardKey,
    colStart: number,
    rowStart: number,
): FocusPanelGridLayout {
    const area = findArea(grid, card);
    if (!area) return grid;
    return placeArea(grid, { ...area, colStart, rowStart });
}

/** Resize a card's region by column/row span (snap/clamp, min 1). PURE. */
export function resizeArea(
    grid: FocusPanelGridLayout,
    card: FocusPanelCardKey,
    colSpan: number,
    rowSpan: number,
): FocusPanelGridLayout {
    const area = findArea(grid, card);
    if (!area) return grid;
    return placeArea(grid, { ...area, colSpan, rowSpan });
}

/** Set a region's reserved room (height). PURE. */
export function setAreaHeight(
    grid: FocusPanelGridLayout,
    card: FocusPanelCardKey,
    height: FocusPanelCellHeight | undefined,
): FocusPanelGridLayout {
    const area = findArea(grid, card);
    if (!area) return grid;
    return placeArea(grid, { ...area, height });
}

/** Remove a card's region. PURE. */
export function removeArea(grid: FocusPanelGridLayout, card: FocusPanelCardKey): FocusPanelGridLayout {
    return { ...grid, areas: grid.areas.filter((a) => a.card !== card) };
}

/**
 * Derive the reading-order `rows` fallback from a grid (one full-width cell per card,
 * top→bottom/left→right) so legacy consumers + responsive collapse keep working.
 */
export function deriveRowsFromGrid(grid: FocusPanelGridLayout): FocusPanelPublishedLayout["rows"] {
    return gridAreasInReadingOrder(grid).map((a) => ({
        cells: [{ width: "full" as const, cards: [a.card], height: a.height }],
    }));
}

/**
 * Convert an existing row/lane/stack published layout into grid placement (so the grid
 * canvas can seed from an already-published row layout). Each row's cells map to areas
 * left→right by their resolved column units; stacked cards drop onto successive rows.
 * If the layout already carries a `grid`, it is returned as-is. PURE.
 */
export function gridFromPublishedLayout(
    layout: FocusPanelPublishedLayout,
    columns: number = FOCUS_PANEL_GRID_COLUMNS,
): FocusPanelGridLayout {
    if (layout.grid) return layout.grid;
    const areas: FocusPanelGridArea[] = [];
    let row = 1;
    for (const r of layout.rows) {
        const units = resolveRowUnits(r.cells);
        let col = 1;
        let maxStack = 1;
        r.cells.forEach((cell, i) => {
            const colSpan = Math.max(1, Math.min(units[i] ?? 1, columns));
            cell.cards.forEach((card, stackIndex) => {
                areas.push({ card, colStart: Math.min(col, columns - colSpan + 1), colSpan, rowStart: row + stackIndex, rowSpan: 1, height: cell.height });
            });
            maxStack = Math.max(maxStack, cell.cards.length);
            col += colSpan;
        });
        row += maxStack;
    }
    return { columns, areas };
}

/** Build a full published layout from a grid (grid = source of truth, rows = fallback). */
export function buildPublishedLayoutFromGrid(grid: FocusPanelGridLayout): FocusPanelPublishedLayout {
    const rows = deriveRowsFromGrid(grid);
    // A grid must yield at least one row for the back-compat invariant.
    return { grid, rows: rows.length > 0 ? rows : [{ cells: [{ width: "full", cards: [] as FocusPanelCardKey[] }] }] };
}

/**
 * Published Focus Panel layout — the OPERATOR-AUTHORED composition that is the
 * runtime source of truth.
 *
 * The Composition Engine (`composeFocusPanelSurface`) provides a smart DEFAULT when
 * no operator layout is published. But once an operator publishes an explicit
 * row/width layout (via Experience Builder), the runtime renders EXACTLY that —
 * rows of cells, each cell a fractional width holding one or more vertically
 * stacked cards — and only collapses to a single column when the surface is too
 * narrow. No hidden auto-layout overrides a published layout.
 *
 * This module is the pure model + render planner (no React, server-safe). The
 * builder authors a `FocusPanelPublishedLayout`; the renderer consumes a
 * `PublishedLayoutPlan`.
 *
 * @see docs/platform/operator/card-composition-system.md (default = recommendation, published = source of truth)
 */

import { normalizeFocusPanelCardKey } from "@/lib/adminV2/runtime/focusPanel/focusPanelCardCatalog";
import type { FocusPanelCardKey } from "@/lib/adminV2/runtime/focusPanel/focusPanelCardModel";

/**
 * Cell width = operator INTENT, not a grid token. The runtime computes exact
 * spacing from intent (see `resolveRowUnits` / `planPublishedLayout`).
 *
 *   - Named sizes (`quarter`…`full`) declare a proportion of the row.
 *   - `fill` is an intent — "take whatever space is left" — so a row never leaves
 *     dead whitespace; the runtime divides the remainder among the fill cells.
 *
 * Legacy fraction values (`1/3`,`1/2`,`2/3`,`full`) remain valid (older published
 * docs) and alias the named sizes.
 */
export type FocusPanelCellWidth =
    | "quarter"
    | "third"
    | "half"
    | "twoThirds"
    | "threeQuarters"
    | "full"
    | "fill"
    // legacy aliases (kept for already-published docs)
    | "1/3"
    | "1/2"
    | "2/3";

/** The intent vocabulary the builder offers (in size order, `fill` last). */
export const FOCUS_PANEL_CELL_WIDTHS: readonly FocusPanelCellWidth[] = [
    "quarter",
    "third",
    "half",
    "twoThirds",
    "threeQuarters",
    "full",
    "fill",
];

/** Operator-facing label for each width intent. */
export const CELL_WIDTH_LABEL: Record<FocusPanelCellWidth, string> = {
    quarter: "Quarter",
    third: "Third",
    half: "Half",
    twoThirds: "Two Thirds",
    threeQuarters: "Three Quarters",
    full: "Full",
    fill: "Fill",
    "1/3": "Third",
    "1/2": "Half",
    "2/3": "Two Thirds",
};

/**
 * Fixed width in 12-unit grid columns. `fill` resolves at plan time (remaining
 * row space) and is represented here as `0` (a sentinel — never rendered directly;
 * `resolveRowUnits` replaces it). The runtime renders proportions via flex-grow on
 * these units, so any pairing fills the row (e.g. threeQuarters + quarter = 9:3 = 3:1).
 */
export const CELL_WIDTH_UNITS: Record<FocusPanelCellWidth, number> = {
    quarter: 3,
    third: 4,
    half: 6,
    twoThirds: 8,
    threeQuarters: 9,
    full: 12,
    fill: 0,
    "1/3": 4,
    "1/2": 6,
    "2/3": 8,
};

export const PUBLISHED_LAYOUT_COLUMN_BASE = 12;

/** The snap stops the canvas resize handle lands on (operator drags; runtime snaps). */
const WIDTH_SNAP_STOPS: { width: FocusPanelCellWidth; fraction: number }[] = [
    { width: "quarter", fraction: 3 / 12 },
    { width: "third", fraction: 4 / 12 },
    { width: "half", fraction: 6 / 12 },
    { width: "twoThirds", fraction: 8 / 12 },
    { width: "threeQuarters", fraction: 9 / 12 },
    { width: "full", fraction: 12 / 12 },
];

/**
 * Snap a 0–1 fraction of the row to the nearest named width — the operator drags a card
 * "bigger / smaller" on the canvas; the runtime resolves it to a token. PURE.
 */
export function snapWidthFromFraction(fraction: number): FocusPanelCellWidth {
    let best = WIDTH_SNAP_STOPS[0]!;
    let bestDist = Infinity;
    for (const stop of WIDTH_SNAP_STOPS) {
        const dist = Math.abs(stop.fraction - fraction);
        if (dist < bestDist) {
            bestDist = dist;
            best = stop;
        }
    }
    return best.width;
}

/** Below this the published layout collapses to a single readable column. */
export const PUBLISHED_LAYOUT_MIN_PX = 560;

/**
 * Cell HEIGHT = how much ROOM the card has before overlay/expanded behavior — the
 * operator drags the bottom edge to give a card more or less room. It never changes the
 * card's question, ownership, editability, or related views (same card, more room).
 */
export type FocusPanelCellHeight = "compact" | "standard" | "tall";

export const FOCUS_PANEL_CELL_HEIGHTS: readonly FocusPanelCellHeight[] = ["compact", "standard", "tall"];

/** Room before expansion, in px (min-height the runtime reserves for the cell). */
export const CELL_HEIGHT_PX: Record<FocusPanelCellHeight, number> = {
    compact: 132,
    standard: 184,
    tall: 268,
};

/** A cell = one column slot of a row, holding one or more vertically STACKED cards. */
export type FocusPanelLayoutCell = {
    width: FocusPanelCellWidth;
    /** Cards stacked top-to-bottom inside this cell (≥1). */
    cards: FocusPanelCardKey[];
    /** Room before expansion (optional; defaults to natural height when absent). */
    height?: FocusPanelCellHeight;
};

/** A row = cells laid left→right, their widths summing toward full (12 units). */
export type FocusPanelLayoutRow = { cells: FocusPanelLayoutCell[] };

/** The grid track count the responsive grid canvas is authored on (12 = fine proportions). */
export const FOCUS_PANEL_GRID_COLUMNS = 12;

/**
 * V5 responsive-grid placement. A card occupies a rectangular region of an N-column ×
 * M-row grid — `colStart`/`rowStart` are 1-based, spans are ≥1. Unlike the row model,
 * a region can span rows VERTICALLY (e.g. Readiness beside a stack of three cards) and
 * regions are independent (no row ownership). This is the composition source of truth
 * when present; the runtime renders it with CSS Grid.
 */
export type FocusPanelGridArea = {
    card: FocusPanelCardKey;
    colStart: number;
    colSpan: number;
    rowStart: number;
    rowSpan: number;
    /** Room before expansion (optional; min-height the runtime reserves for the region). */
    height?: FocusPanelCellHeight;
};

export type FocusPanelGridLayout = {
    /** Track count (e.g. 12). Areas place against `repeat(columns, 1fr)`. */
    columns: number;
    areas: FocusPanelGridArea[];
};

/**
 * The published, operator-authored layout — the runtime source of truth.
 *
 * `rows` is the legacy/back-compat representation (and the reading-order fallback used
 * for responsive collapse). `grid` (V5) is the richer responsive-grid placement; when
 * present it WINS at runtime. Builders that author a grid also keep `rows` in reading
 * order so older consumers (`deriveFocusPanelGridFromLayoutDoc`, reading order) still work.
 */
export type FocusPanelPublishedLayout = { rows: FocusPanelLayoutRow[]; grid?: FocusPanelGridLayout };

/** A planned cell the renderer paints (width resolved to grid units). */
export type PublishedLayoutCellPlan = { widthUnits: number; cards: FocusPanelCardKey[]; minHeightPx?: number };
export type PublishedLayoutRowPlan = { cells: PublishedLayoutCellPlan[] };
/** One card placed in a lane, with the room (min-height) its authoring cell reserved. */
export type PublishedLayoutLaneCard = { key: FocusPanelCardKey; minHeightPx?: number };
/** A vertical LANE the renderer paints as one continuous column (column-major). */
export type PublishedLayoutLanePlan = { widthUnits: number; cards: PublishedLayoutLaneCard[] };
/** A planned grid region the renderer paints with CSS Grid placement (V5). */
export type PublishedLayoutAreaPlan = {
    card: FocusPanelCardKey;
    colStart: number;
    colSpan: number;
    rowStart: number;
    rowSpan: number;
    minHeightPx?: number;
};
export type PublishedLayoutPlan = {
    columnBase: number;
    /** True → single column (surface too narrow); honors reading order. */
    collapsed: boolean;
    /**
     * How the renderer composes the surface:
     *   - `"grid"` — V5 responsive CSS-Grid placement (regions with vertical/horizontal
     *     spans). Used when the layout carries a `grid`. The richest model.
     *   - `"lanes"` — column-major continuous lanes that FILL the surface. Used when the
     *     authored row layout is column-regular (the common case).
     *   - `"rows"` — literal row-major rendering (collapsed single column, irregular rows).
     */
    strategy: "grid" | "lanes" | "rows";
    /** Grid track count, populated when `strategy === "grid"`. */
    gridColumns: number;
    /** Populated when `strategy === "grid"` (else empty). */
    areas: PublishedLayoutAreaPlan[];
    /** Populated when `strategy === "lanes"` (else empty). */
    lanes: PublishedLayoutLanePlan[];
    /** The literal row plan — always populated (the row-major fallback + back-compat). */
    rows: PublishedLayoutRowPlan[];
};

// Every accepted width value — the builder-offered intents PLUS legacy fraction
// aliases — so already-published docs keep validating. (FOCUS_PANEL_CELL_WIDTHS is
// only the subset the builder offers as buttons.)
const ALL_CARD_WIDTHS = new Set<string>(Object.keys(CELL_WIDTH_UNITS));

/** Validate a value is a well-formed grid layout (defensive for stored docs). */
export function isFocusPanelGridLayout(value: unknown): value is FocusPanelGridLayout {
    if (!value || typeof value !== "object") return false;
    const grid = value as FocusPanelGridLayout;
    if (typeof grid.columns !== "number" || grid.columns < 1) return false;
    if (!Array.isArray(grid.areas) || grid.areas.length === 0) return false;
    return grid.areas.every(
        (a) =>
            a &&
            typeof a.card === "string" &&
            Number.isInteger(a.colStart) &&
            a.colStart >= 1 &&
            Number.isInteger(a.colSpan) &&
            a.colSpan >= 1 &&
            a.colStart + a.colSpan - 1 <= grid.columns &&
            Number.isInteger(a.rowStart) &&
            a.rowStart >= 1 &&
            Number.isInteger(a.rowSpan) &&
            a.rowSpan >= 1,
    );
}

/** Validate a value is a well-formed published layout (defensive for stored docs). */
export function isFocusPanelPublishedLayout(value: unknown): value is FocusPanelPublishedLayout {
    if (!value || typeof value !== "object") return false;
    // A V5 grid is sufficient on its own; `rows` may be a thin reading-order fallback.
    const grid = (value as FocusPanelPublishedLayout).grid;
    if (grid !== undefined && !isFocusPanelGridLayout(grid)) return false;
    const rows = (value as FocusPanelPublishedLayout).rows;
    const rowsOk =
        Array.isArray(rows) &&
        rows.length > 0 &&
        rows.every(
            (row) =>
                row &&
                Array.isArray(row.cells) &&
                row.cells.length > 0 &&
                row.cells.every(
                    (cell) =>
                        cell &&
                        ALL_CARD_WIDTHS.has(cell.width) &&
                        Array.isArray(cell.cards) &&
                        cell.cards.length > 0 &&
                        cell.cards.every((c) => typeof c === "string"),
                ),
        );
    // Valid when EITHER a grid is present (rows optional) OR the rows model is well-formed.
    return isFocusPanelGridLayout(grid) || rowsOk;
}

/** LayoutDoc metadata key carrying the operator-published explicit layout. */
export const FOCUS_PANEL_PUBLISHED_LAYOUT_META_KEY = "focusPanelLayout" as const;

/** Read + validate the published layout from a Summary LayoutDoc's metadata, or null. */
/**
 * Normalize every card key inside a stored published layout.
 *
 * THE STORED BLOB IS CONFIGURATION, AND CONFIGURATION NORMALIZES. `readFocusPanelCardSectionMeta`
 * already normalizes the section path, but the published layout is a SECOND record of the same
 * composition held in doc metadata, and it was returned verbatim. A tenant whose layout was
 * published naming a superseded key therefore resolved that key on one path and not the other —
 * two readers of one document disagreeing about which card is placed, which is how a card ends up
 * both present and absent in the same render.
 */
function normalizePublishedLayoutCardKeys(layout: FocusPanelPublishedLayout): FocusPanelPublishedLayout {
    const normalizeKey = (card: FocusPanelCardKey): FocusPanelCardKey =>
        normalizeFocusPanelCardKey(card) ?? card;
    return {
        ...layout,
        ...(layout.grid
            ? {
                  grid: {
                      ...layout.grid,
                      areas: layout.grid.areas.map((a) => ({ ...a, card: normalizeKey(a.card) })),
                  },
              }
            : {}),
        rows: layout.rows.map((row) => ({
            ...row,
            cells: row.cells.map((cell) => ({ ...cell, cards: cell.cards.map(normalizeKey) })),
        })),
    };
}

export function readFocusPanelPublishedLayout(
    doc: { metadata?: Record<string, unknown> | null } | null | undefined,
): FocusPanelPublishedLayout | null {
    const raw = doc?.metadata?.[FOCUS_PANEL_PUBLISHED_LAYOUT_META_KEY];
    return isFocusPanelPublishedLayout(raw) ? normalizePublishedLayoutCardKeys(raw) : null;
}

/** Areas top→bottom, then left→right — the grid's natural reading order. */
export function gridAreasInReadingOrder(grid: FocusPanelGridLayout): FocusPanelGridArea[] {
    return [...grid.areas].sort((a, b) => a.rowStart - b.rowStart || a.colStart - b.colStart);
}

/**
 * Reading order = grid areas top→bottom/left→right when a grid is present, else rows
 * top→bottom, cells left→right, stacked cards top→bottom. Drives responsive collapse.
 */
export function publishedLayoutReadingOrder(layout: FocusPanelPublishedLayout): FocusPanelCardKey[] {
    if (layout.grid) return gridAreasInReadingOrder(layout.grid).map((a) => a.card);
    return layout.rows.flatMap((row) => row.cells.flatMap((cell) => cell.cards));
}

/**
 * Resolve a row's cells to exact grid units — THE runtime's "compute spacing" step.
 *
 * Fixed cells take their named units. `fill` cells absorb the row's remaining units
 * (12 − fixed), split as evenly as possible (the last fill cell takes any remainder),
 * so the row always sums to the column base and never leaves dead whitespace. If the
 * fixed cells already meet/exceed the base, each fill cell still gets a minimum of 1
 * unit (it stays visible; flex-grow keeps the row proportional).
 */
export function resolveRowUnits(cells: FocusPanelLayoutCell[]): number[] {
    const fixed = cells.map((c) => (c.width === "fill" ? null : CELL_WIDTH_UNITS[c.width]));
    const fillIdx = fixed.flatMap((u, i) => (u == null ? [i] : []));
    if (fillIdx.length === 0) return fixed.map((u) => u ?? 0);
    const usedFixed = fixed.reduce<number>((sum, u) => sum + (u ?? 0), 0);
    const remaining = Math.max(fillIdx.length, PUBLISHED_LAYOUT_COLUMN_BASE - usedFixed);
    const per = Math.floor(remaining / fillIdx.length);
    const units = fixed.map((u) => u ?? 0);
    fillIdx.forEach((cellIndex, n) => {
        units[cellIndex] = n === fillIdx.length - 1 ? remaining - per * (fillIdx.length - 1) : per;
    });
    return units;
}

/**
 * The authored layout is "column-regular" when every row shares the same column
 * structure — the same number of cells, with the same widths, in the same order. This
 * is the common case (a clean grid), and it is exactly the shape that composes into
 * continuous vertical LANES: each column becomes one lane that fills its proportional
 * width, so a short cell never floats in a tall row leaving dead space.
 *
 * Returns the shared column widths, or `null` when the layout is irregular (e.g. a
 * full-width banner row over a multi-column row) and must stay row-major. PURE.
 */
export function publishedLayoutColumnWidths(
    layout: FocusPanelPublishedLayout,
): FocusPanelCellWidth[] | null {
    const first = layout.rows[0]?.cells;
    if (!first || first.length === 0) return null;
    const widths = first.map((c) => c.width);
    const regular = layout.rows.every(
        (row) =>
            row.cells.length === widths.length &&
            row.cells.every((cell, i) => cell.width === widths[i]),
    );
    return regular ? widths : null;
}

/** The literal row plan (row-major) — widths resolved to grid units. PURE. */
function planPublishedRows(layout: FocusPanelPublishedLayout): PublishedLayoutRowPlan[] {
    return layout.rows.map((row) => {
        const units = resolveRowUnits(row.cells);
        return {
            cells: row.cells.map((cell, cellIndex) => ({
                widthUnits: units[cellIndex] ?? 0,
                cards: cell.cards,
                minHeightPx: cell.height ? CELL_HEIGHT_PX[cell.height] : undefined,
            })),
        };
    });
}

/**
 * Resolve a published layout + available width into a render plan. PURE.
 *
 * At/above the min width the plan honors the published rows/cells/widths EXACTLY, and
 * — when the layout is column-regular — composes them into continuous vertical lanes so
 * the surface FILLS with no dead whitespace (the runtime owns visual fit; the published
 * widths/placement are preserved). Below the min width (or unknown width 0 → treat as
 * wide for SSR) it collapses to a single column in reading order — the only sanctioned
 * override of a published layout.
 */
/**
 * Column-major lanes derived from an authored V5 grid — a RUNTIME-ONLY presentation flow
 * (the authored grid coordinates remain the source of truth). Buckets areas into vertical
 * columns by `colStart` and flows each column as one continuous lane, so short cards in one
 * column never inherit a tall neighbour's row height (no dead vertical gaps). Returns null
 * when the grid is not cleanly column-partitionable (a full-width spanner or overlapping
 * columns) — the caller then keeps the exact CSS-Grid placement.
 */
function planLanesFromGrid(grid: FocusPanelGridLayout): PublishedLayoutLanePlan[] | null {
    if (grid.areas.length === 0) return null;
    // A card spanning the full width can't live inside a single side-by-side lane.
    if (grid.areas.some((a) => a.colSpan >= grid.columns)) return null;

    const byColStart = new Map<number, FocusPanelGridArea[]>();
    for (const a of grid.areas) {
        const list = byColStart.get(a.colStart);
        if (list) list.push(a);
        else byColStart.set(a.colStart, [a]);
    }
    const colStarts = [...byColStart.keys()].sort((x, y) => x - y);
    if (colStarts.length < 2) return null; // single column — nothing to transpose

    // Columns must not overlap: a column's widest card must not cross into the next column.
    for (let i = 0; i < colStarts.length - 1; i += 1) {
        const areas = byColStart.get(colStarts[i]!)!;
        const maxEnd = Math.max(...areas.map((a) => a.colStart + a.colSpan));
        if (maxEnd > colStarts[i + 1]!) return null;
    }

    return colStarts.map((cs) => {
        const areas = byColStart.get(cs)!.slice().sort((a, b) => a.rowStart - b.rowStart);
        return {
            widthUnits: Math.max(...areas.map((a) => a.colSpan)),
            cards: areas.map((a) => ({
                key: a.card,
                minHeightPx: a.height ? CELL_HEIGHT_PX[a.height] : undefined,
            })),
        };
    });
}

export function planPublishedLayout(
    layout: FocusPanelPublishedLayout,
    availableWidthPx: number,
    opts?: { preferLanesFromGrid?: boolean },
): PublishedLayoutPlan {
    const collapsed = availableWidthPx > 0 && availableWidthPx < PUBLISHED_LAYOUT_MIN_PX;
    if (collapsed) {
        return {
            columnBase: PUBLISHED_LAYOUT_COLUMN_BASE,
            collapsed: true,
            strategy: "rows",
            gridColumns: PUBLISHED_LAYOUT_COLUMN_BASE,
            areas: [],
            lanes: [],
            rows: publishedLayoutReadingOrder(layout).map((card) => ({
                cells: [{ widthUnits: PUBLISHED_LAYOUT_COLUMN_BASE, cards: [card] }],
            })),
        };
    }

    // The literal row plan is always available (back-compat + the row-major fallback).
    const rows = planPublishedRows(layout);

    // Focus Panel Work mode opts into column-major lanes derived from the authored grid so
    // short cards never inherit a tall neighbour's row height (no dead vertical gaps). This
    // is a runtime presentation choice only — the authored grid coordinates are unchanged.
    if (opts?.preferLanesFromGrid && layout.grid) {
        const lanes = planLanesFromGrid(layout.grid);
        if (lanes) {
            return {
                columnBase: PUBLISHED_LAYOUT_COLUMN_BASE,
                collapsed: false,
                strategy: "lanes",
                gridColumns: PUBLISHED_LAYOUT_COLUMN_BASE,
                areas: [],
                lanes,
                rows,
            };
        }
    }

    // V5 responsive grid is the richest model (vertical/horizontal spans, independent
    // regions). When present it wins — the runtime paints each area with CSS Grid.
    if (layout.grid) {
        const areas: PublishedLayoutAreaPlan[] = layout.grid.areas.map((a) => ({
            card: a.card,
            colStart: a.colStart,
            colSpan: a.colSpan,
            rowStart: a.rowStart,
            rowSpan: a.rowSpan,
            minHeightPx: a.height ? CELL_HEIGHT_PX[a.height] : undefined,
        }));
        return {
            columnBase: PUBLISHED_LAYOUT_COLUMN_BASE,
            collapsed: false,
            strategy: "grid",
            gridColumns: layout.grid.columns,
            areas,
            lanes: [],
            rows,
        };
    }

    // Column-major lanes when the grid is column-regular: transpose rows→lanes so each
    // column flows as one continuous lane filling its proportional width. A cell's
    // reserved room (height) lands on the first card of that cell's segment.
    const columnWidths = publishedLayoutColumnWidths(layout);
    if (columnWidths) {
        const units = resolveRowUnits(layout.rows[0]!.cells);
        const lanes: PublishedLayoutLanePlan[] = columnWidths.map((_, colIndex) => ({
            widthUnits: units[colIndex] ?? 0,
            cards: layout.rows.flatMap((row) => {
                const cell = row.cells[colIndex]!;
                const minHeightPx = cell.height ? CELL_HEIGHT_PX[cell.height] : undefined;
                return cell.cards.map((key, i) => ({ key, minHeightPx: i === 0 ? minHeightPx : undefined }));
            }),
        }));
        return { columnBase: PUBLISHED_LAYOUT_COLUMN_BASE, collapsed: false, strategy: "lanes", gridColumns: PUBLISHED_LAYOUT_COLUMN_BASE, areas: [], lanes, rows };
    }

    return { columnBase: PUBLISHED_LAYOUT_COLUMN_BASE, collapsed: false, strategy: "rows", gridColumns: PUBLISHED_LAYOUT_COLUMN_BASE, areas: [], lanes: [], rows };
}

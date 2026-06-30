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
    "full",
    "fill",
];

/** Operator-facing label for each width intent. */
export const CELL_WIDTH_LABEL: Record<FocusPanelCellWidth, string> = {
    quarter: "Quarter",
    third: "Third",
    half: "Half",
    twoThirds: "Two Thirds",
    full: "Full",
    fill: "Fill",
    "1/3": "Third",
    "1/2": "Half",
    "2/3": "Two Thirds",
};

/**
 * Fixed width in 12-unit grid columns. `fill` resolves at plan time (remaining
 * row space) and is represented here as `0` (a sentinel — never rendered directly;
 * `resolveRowUnits` replaces it).
 */
export const CELL_WIDTH_UNITS: Record<FocusPanelCellWidth, number> = {
    quarter: 3,
    third: 4,
    half: 6,
    twoThirds: 8,
    full: 12,
    fill: 0,
    "1/3": 4,
    "1/2": 6,
    "2/3": 8,
};

export const PUBLISHED_LAYOUT_COLUMN_BASE = 12;

/** Below this the published layout collapses to a single readable column. */
export const PUBLISHED_LAYOUT_MIN_PX = 560;

/** A cell = one column slot of a row, holding one or more vertically STACKED cards. */
export type FocusPanelLayoutCell = {
    width: FocusPanelCellWidth;
    /** Cards stacked top-to-bottom inside this cell (≥1). */
    cards: FocusPanelCardKey[];
};

/** A row = cells laid left→right, their widths summing toward full (12 units). */
export type FocusPanelLayoutRow = { cells: FocusPanelLayoutCell[] };

/** The published, operator-authored layout — the runtime source of truth. */
export type FocusPanelPublishedLayout = { rows: FocusPanelLayoutRow[] };

/** A planned cell the renderer paints (width resolved to grid units). */
export type PublishedLayoutCellPlan = { widthUnits: number; cards: FocusPanelCardKey[] };
export type PublishedLayoutRowPlan = { cells: PublishedLayoutCellPlan[] };
export type PublishedLayoutPlan = {
    columnBase: number;
    /** True → single column (surface too narrow); honors reading order. */
    collapsed: boolean;
    rows: PublishedLayoutRowPlan[];
};

// Every accepted width value — the builder-offered intents PLUS legacy fraction
// aliases — so already-published docs keep validating. (FOCUS_PANEL_CELL_WIDTHS is
// only the subset the builder offers as buttons.)
const ALL_CARD_WIDTHS = new Set<string>(Object.keys(CELL_WIDTH_UNITS));

/** Validate a value is a well-formed published layout (defensive for stored docs). */
export function isFocusPanelPublishedLayout(value: unknown): value is FocusPanelPublishedLayout {
    if (!value || typeof value !== "object") return false;
    const rows = (value as FocusPanelPublishedLayout).rows;
    if (!Array.isArray(rows) || rows.length === 0) return false;
    return rows.every(
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
}

/** LayoutDoc metadata key carrying the operator-published explicit layout. */
export const FOCUS_PANEL_PUBLISHED_LAYOUT_META_KEY = "focusPanelLayout" as const;

/** Read + validate the published layout from a Summary LayoutDoc's metadata, or null. */
export function readFocusPanelPublishedLayout(
    doc: { metadata?: Record<string, unknown> | null } | null | undefined,
): FocusPanelPublishedLayout | null {
    const raw = doc?.metadata?.[FOCUS_PANEL_PUBLISHED_LAYOUT_META_KEY];
    return isFocusPanelPublishedLayout(raw) ? raw : null;
}

/** Reading order = rows top→bottom, cells left→right, stacked cards top→bottom. */
export function publishedLayoutReadingOrder(layout: FocusPanelPublishedLayout): FocusPanelCardKey[] {
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
 * Resolve a published layout + available width into a render plan. PURE.
 *
 * At/above the min width the plan honors the published rows/cells/widths EXACTLY.
 * Below it (or unknown width 0 → treat as wide for SSR) it collapses to a single
 * column in reading order — the only sanctioned override of a published layout.
 */
export function planPublishedLayout(
    layout: FocusPanelPublishedLayout,
    availableWidthPx: number,
): PublishedLayoutPlan {
    const collapsed = availableWidthPx > 0 && availableWidthPx < PUBLISHED_LAYOUT_MIN_PX;
    if (collapsed) {
        return {
            columnBase: PUBLISHED_LAYOUT_COLUMN_BASE,
            collapsed: true,
            rows: publishedLayoutReadingOrder(layout).map((card) => ({
                cells: [{ widthUnits: PUBLISHED_LAYOUT_COLUMN_BASE, cards: [card] }],
            })),
        };
    }
    return {
        columnBase: PUBLISHED_LAYOUT_COLUMN_BASE,
        collapsed: false,
        rows: layout.rows.map((row) => {
            const units = resolveRowUnits(row.cells);
            return {
                cells: row.cells.map((cell, cellIndex) => ({
                    widthUnits: units[cellIndex] ?? 0,
                    cards: cell.cards,
                })),
            };
        }),
    };
}

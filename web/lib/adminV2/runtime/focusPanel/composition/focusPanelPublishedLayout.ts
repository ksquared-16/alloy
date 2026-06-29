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

/** Operator-facing fractional cell widths (the builder's width buttons). */
export type FocusPanelCellWidth = "1/3" | "1/2" | "2/3" | "full";

export const FOCUS_PANEL_CELL_WIDTHS: readonly FocusPanelCellWidth[] = ["1/3", "1/2", "2/3", "full"];

/** Width in 12-unit grid columns. */
export const CELL_WIDTH_UNITS: Record<FocusPanelCellWidth, number> = {
    "1/3": 4,
    "1/2": 6,
    "2/3": 8,
    full: 12,
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

const ALL_CARD_WIDTHS = new Set<string>(FOCUS_PANEL_CELL_WIDTHS);

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
        rows: layout.rows.map((row) => ({
            cells: row.cells.map((cell) => ({
                widthUnits: CELL_WIDTH_UNITS[cell.width],
                cards: cell.cards,
            })),
        })),
    };
}

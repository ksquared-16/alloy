/**
 * Queue Row — stacked condensed-row model (Presentation Runtime V3).
 *
 * The condensed queue row is a fixed 440px rail. Historically every block was
 * forced onto ONE horizontal line; there was never enough room. This model lets
 * the builder arrange blocks into stacked SECTIONS (rows) inside the same 440px
 * frame — e.g.
 *
 *     Row 1:  Household | Status
 *     Row 2:  Children  | Attention
 *     Row 3:  Actions / Date
 *
 * Pure + framework-free so it is exhaustively unit-testable. The builder maps its
 * per-zone state onto `StackedItem`s; persistence writes `rowIndex` onto each
 * `QueueRecordColumnConfig` (back-compat: absent = row 0).
 *
 * @see queueRecordLayoutV3.ts (QueueRecordColumnConfig.rowIndex)
 * @see docs/platform/operator/queue-row-platform.md
 */

/** Max stacked sections inside the condensed rail (Row 1 / Row 2 / Row 3). */
export const MAX_STACKED_ROWS = 3;

/** One placeable item (maps to a builder zone / a persisted column). */
export type StackedItem = {
    key: string;
    /** 0-based stacked section. Clamped to [0, MAX_STACKED_ROWS-1]. */
    rowIndex: number;
    /** Whether the item is currently placed in the row (vs the library). */
    inRow: boolean;
};

/** A resolved stacked section for rendering. */
export type StackedRow = {
    rowIndex: number;
    items: StackedItem[];
};

/** Clamp a raw row index into the valid stacked range. */
export function clampRowIndex(rowIndex: number): number {
    if (!Number.isFinite(rowIndex)) return 0;
    return Math.max(0, Math.min(MAX_STACKED_ROWS - 1, Math.floor(rowIndex)));
}

/**
 * Group placed items into ordered stacked rows. Preserves the input order of
 * items *within* each row (that is the horizontal order). Only rows that contain
 * at least one placed item are returned, sorted ascending by rowIndex.
 */
export function stackedRows(items: readonly StackedItem[]): StackedRow[] {
    const byRow = new Map<number, StackedItem[]>();
    for (const item of items) {
        if (!item.inRow) continue;
        const row = clampRowIndex(item.rowIndex);
        const bucket = byRow.get(row) ?? [];
        bucket.push(item);
        byRow.set(row, bucket);
    }
    return [...byRow.keys()]
        .sort((a, b) => a - b)
        .map((rowIndex) => ({ rowIndex, items: byRow.get(rowIndex)! }));
}

/** How many distinct occupied stacked rows there are. */
export function occupiedRowCount(items: readonly StackedItem[]): number {
    return stackedRows(items).length;
}

/**
 * Move an item to a target stacked row. Returns a new array (does not mutate).
 * Placing an item also marks it `inRow: true`. Target is clamped.
 */
export function moveItemToRow(
    items: readonly StackedItem[],
    key: string,
    targetRowIndex: number,
): StackedItem[] {
    const target = clampRowIndex(targetRowIndex);
    return items.map((item) =>
        item.key === key ? { ...item, rowIndex: target, inRow: true } : item,
    );
}

/**
 * Reorder an item horizontally within its row. `beforeKey` = the key to insert
 * before (null → move to end of the row). Only affects the array order of items
 * in the same row; other rows are untouched. Returns a new array.
 */
export function reorderWithinRow(
    items: readonly StackedItem[],
    key: string,
    beforeKey: string | null,
): StackedItem[] {
    const moving = items.find((i) => i.key === key);
    if (!moving) return [...items];
    const rest = items.filter((i) => i.key !== key);
    if (beforeKey === null) {
        // Append after the last item currently in the moving item's row.
        const rowItems = rest.filter((i) => i.inRow && clampRowIndex(i.rowIndex) === clampRowIndex(moving.rowIndex));
        const lastInRow = rowItems[rowItems.length - 1];
        if (!lastInRow) return [...rest, moving];
        const idx = rest.indexOf(lastInRow);
        return [...rest.slice(0, idx + 1), moving, ...rest.slice(idx + 1)];
    }
    const beforeIdx = rest.findIndex((i) => i.key === beforeKey);
    if (beforeIdx < 0) return [...rest, moving];
    return [...rest.slice(0, beforeIdx), moving, ...rest.slice(beforeIdx)];
}

/**
 * Collapse gaps so occupied rows are contiguous starting at 0 (e.g. items only
 * in rows 0 and 2 → remapped to 0 and 1). Keeps relative order. Returns a new
 * array; unplaced items keep their rowIndex untouched but are ignored for gaps.
 */
export function normalizeRowIndices(items: readonly StackedItem[]): StackedItem[] {
    const occupied = [...new Set(items.filter((i) => i.inRow).map((i) => clampRowIndex(i.rowIndex)))].sort((a, b) => a - b);
    const remap = new Map<number, number>();
    occupied.forEach((row, i) => remap.set(row, i));
    return items.map((item) =>
        item.inRow ? { ...item, rowIndex: remap.get(clampRowIndex(item.rowIndex)) ?? 0 } : item,
    );
}

/** Can another stacked row be added (are we under the max occupied rows)? */
export function canAddRow(items: readonly StackedItem[]): boolean {
    return occupiedRowCount(items) < MAX_STACKED_ROWS;
}

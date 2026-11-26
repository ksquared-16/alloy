/**
 * Nested-surface field row layout — mirrors form `layout_width: full | half` pairing.
 * Consecutive half-width fields render on the same row (desktop); narrow viewports stack.
 */

export type NestedSurfaceFieldLayoutWidth = "full" | "half" | "third";

/** Visual drag target — beside pairs fields; below starts a new full row. */
export type NestedSurfaceFieldDropZone = "beside" | "below" | "third";

/** Field keys that always occupy a full row (multi-line / composite blocks). */
export const NESTED_SURFACE_FORCE_FULL_ROW_FIELD_KEYS = new Set<string>([
    "inquiry_child.schedule_type",
    "inquiry_child.desired_schedule_type",
]);

export function isNestedSurfaceFieldHalfWidth(width: NestedSurfaceFieldLayoutWidth | undefined): boolean {
    return width === "half";
}

export function isNestedSurfaceFieldThirdWidth(width: NestedSurfaceFieldLayoutWidth | undefined): boolean {
    return width === "third";
}

const ROW_WIDTH_UNITS: Record<NestedSurfaceFieldLayoutWidth, number> = {
    full: 3,
    half: 2,
    third: 1,
};

export function nestedSurfaceRowWidthUnits(width: NestedSurfaceFieldLayoutWidth | undefined): number {
    return ROW_WIDTH_UNITS[width ?? "full"];
}

export function nestedSurfaceRowHasCapacity(
    usedUnits: number,
    width: NestedSurfaceFieldLayoutWidth | undefined,
): boolean {
    return usedUnits + nestedSurfaceRowWidthUnits(width) <= 3;
}

export function nestedSurfaceFieldMustFullRow(fieldKey: string): boolean {
    return NESTED_SURFACE_FORCE_FULL_ROW_FIELD_KEYS.has(fieldKey);
}

/**
 * Group ordered field keys into visual rows.
 * Supports full, half (max 2 per row), and third (max 3 per row) widths.
 */
export function chunkNestedSurfaceFieldsForHalfRowLayout(
    fieldKeys: readonly string[],
    layoutWidthFor: (fieldKey: string) => NestedSurfaceFieldLayoutWidth,
): string[][] {
    const out: string[][] = [];
    let i = 0;
    while (i < fieldKeys.length) {
        const key = fieldKeys[i]!;
        const width = layoutWidthFor(key);
        if (nestedSurfaceFieldMustFullRow(key) || width === "full") {
            out.push([key]);
            i += 1;
            continue;
        }
        if (width === "third") {
            const row: string[] = [key];
            i += 1;
            while (i < fieldKeys.length) {
                const nextKey = fieldKeys[i]!;
                if (nestedSurfaceFieldMustFullRow(nextKey) || layoutWidthFor(nextKey) !== "third" || row.length >= 3) {
                    break;
                }
                row.push(nextKey);
                i += 1;
            }
            out.push(row);
            continue;
        }
        const nextKey = fieldKeys[i + 1];
        if (
            nextKey
            && !nestedSurfaceFieldMustFullRow(nextKey)
            && layoutWidthFor(nextKey) === "half"
        ) {
            out.push([key, nextKey]);
            i += 2;
        } else {
            out.push([key]);
            i += 1;
        }
    }
    return out;
}

/** @deprecated Use chunkNestedSurfaceFieldsForHalfRowLayout — name kept for import stability. */
export const chunkNestedSurfaceFieldsForRowLayout = chunkNestedSurfaceFieldsForHalfRowLayout;

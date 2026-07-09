/**
 * Nested-surface field row layout — mirrors form `layout_width: full | half` pairing.
 * Consecutive half-width fields render on the same row (desktop); narrow viewports stack.
 */

export type NestedSurfaceFieldLayoutWidth = "full" | "half";

/** Visual drag target — beside pairs fields; below starts a new full row. */
export type NestedSurfaceFieldDropZone = "beside" | "below";

/** Field keys that always occupy a full row (multi-line / composite blocks). */
export const NESTED_SURFACE_FORCE_FULL_ROW_FIELD_KEYS = new Set<string>([
    "inquiry_child.schedule_type",
    "inquiry_child.desired_schedule_type",
]);

export function isNestedSurfaceFieldHalfWidth(width: NestedSurfaceFieldLayoutWidth | undefined): boolean {
    return width === "half";
}

export function nestedSurfaceFieldMustFullRow(fieldKey: string): boolean {
    return NESTED_SURFACE_FORCE_FULL_ROW_FIELD_KEYS.has(fieldKey);
}

/**
 * Group ordered field keys into visual rows. Consecutive half-width keys pair (max 2 per row).
 */
export function chunkNestedSurfaceFieldsForHalfRowLayout(
    fieldKeys: readonly string[],
    layoutWidthFor: (fieldKey: string) => NestedSurfaceFieldLayoutWidth,
): string[][] {
    const out: string[][] = [];
    let i = 0;
    while (i < fieldKeys.length) {
        const key = fieldKeys[i]!;
        if (nestedSurfaceFieldMustFullRow(key) || !isNestedSurfaceFieldHalfWidth(layoutWidthFor(key))) {
            out.push([key]);
            i += 1;
            continue;
        }
        const nextKey = fieldKeys[i + 1];
        if (
            nextKey
            && !nestedSurfaceFieldMustFullRow(nextKey)
            && isNestedSurfaceFieldHalfWidth(layoutWidthFor(nextKey))
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

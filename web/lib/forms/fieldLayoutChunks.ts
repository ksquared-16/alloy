import type { FormField } from "@/lib/forms/schema";
import { groupFieldsIntoRows, layoutWidthFromField } from "@/lib/forms/formRowComposition";

function isHalf(f: FormField): boolean {
    return (f as { layout_width?: string }).layout_width === "half";
}

/** Groups and signatures always occupy a full visual row (V1). */
function mustFullRow(f: FormField): boolean {
    return f.type === "group" || f.type === "signature";
}

/**
 * Group consecutive half-width scalar fields into pairs for a two-column row on desktop.
 * Order matches `fields` (typically already visibility-filtered).
 */
export function chunkFieldsForHalfRowLayout(fields: readonly FormField[]): FormField[][] {
    const out: FormField[][] = [];
    let i = 0;
    while (i < fields.length) {
        const f = fields[i]!;
        if (mustFullRow(f) || !isHalf(f)) {
            out.push([f]);
            i += 1;
            continue;
        }
        const next = fields[i + 1];
        if (next && !mustFullRow(next) && isHalf(next)) {
            out.push([f, next]);
            i += 2;
        } else {
            out.push([f]);
            i += 1;
        }
    }
    return out;
}

/**
 * THE PARTICIPANT SEES THE ROWS FORMS STUDIO SHOWS.
 *
 * `chunkFieldsForHalfRowLayout` pairs only consecutive half-width fields, so a third or a quarter the
 * operator chose in Studio rendered full width to the family, and an address's City | State | ZIP came
 * out as three stacked boxes. Rows are composed here by the Studio's own row authority
 * (`groupFieldsIntoRows`, 12 units: full 12, half 6, third 4, quarter 3), with groups and signatures
 * always on a row of their own because they are blocks, not boxes.
 *
 * In a narrow form every cell is full width (`grid-cols-1`); once the FORM is at least 28rem wide
 * (`@md`, a container query on `RUNTIME_FORM_CONTAINER_CLASS`) the row uses its widths. The form's own
 * width decides, not the browser window's (P1-C): a form framed in a 760px iframe on a school's site,
 * the same form standalone on a laptop and Forms Studio's Preview pane all have about the same room,
 * and now lay out the same. A viewport breakpoint collapsed only the framed one.
 */
export function composeRuntimeRows(fields: readonly FormField[]): FormField[][] {
    const asBlocks = new Map(
        fields.map((f) => {
            const block = f.type === "group" || f.type === "signature";
            return [f.id, block ? ({ ...f, layout_width: "full" } as FormField) : f] as const;
        }),
    );
    const byId = new Map(fields.map((f) => [f.id, f] as const));
    return groupFieldsIntoRows(
        fields.map((f) => f.id),
        asBlocks,
    ).map((row) => row.map((id) => byId.get(id)!));
}

/**
 * The element every runtime row measures itself against — the form root of the public renderer and of
 * Forms Studio's Preview. Rows inside it switch to their widths at `@md` (28rem of FORM width).
 */
export const RUNTIME_FORM_CONTAINER_CLASS = "@container";

/** Tailwind column span for a cell, literal so the classes are emitted. */
export function runtimeCellSpanClass(field: FormField): string {
    switch (layoutWidthFromField(field)) {
        case "quarter":
            return "@md:col-span-3";
        case "third":
            return "@md:col-span-4";
        case "half":
            return "@md:col-span-6";
        default:
            return "@md:col-span-12";
    }
}

/** A row with more than one cell becomes a 12-column grid once the form is `@md` wide; a single cell is a plain block. */
export function runtimeRowClass(row: readonly FormField[]): string {
    return row.length > 1 ? "grid grid-cols-1 gap-4 @md:grid-cols-12 @md:gap-6" : "block";
}

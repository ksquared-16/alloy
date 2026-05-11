import type { FormField } from "@/lib/forms/schema";

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

/**
 * Ensure person-contact layout fields are editable when the save coordinator supports them.
 */

import type { LayoutDoc, LayoutItem } from "@/lib/layout/layoutV2";
import { collectLayoutItems } from "@/lib/layout/runtime/classifyLayoutItemBinding";
import { isLayoutRuntimePersonContactRefKey } from "@/lib/layout/runtime/layoutRuntimePersonContactEdit";

function enrichItem(item: LayoutItem): LayoutItem {
    if (item.kind !== "field" || !item.refKey) return item;
    if (!isLayoutRuntimePersonContactRefKey(item.refKey)) return item;
    if (item.editable === true) return item;
    return { ...item, editable: true };
}

function enrichItems(items: LayoutItem[]): LayoutItem[] {
    return items.map((item) => {
        const next = enrichItem(item);
        if (next.kind === "field_group") {
            const rows = next.rows?.map((row) => ({
                ...row,
                columns: row.columns.map((col) => ({
                    ...col,
                    items: enrichItems(col.items),
                })),
            }));
            const nested = next.items ? enrichItems(next.items) : next.items;
            return { ...next, rows, items: nested };
        }
        return next;
    });
}

/** Person-contact fields default to editable in layout runtime (save path exists). */
export function enrichLayoutDocPersonContactEditable(doc: LayoutDoc): LayoutDoc {
    return {
        ...doc,
        sections: doc.sections.map((section) => ({
            ...section,
            rows: section.rows.map((row) => ({
                ...row,
                columns: row.columns.map((col) => ({
                    ...col,
                    items: enrichItems(col.items),
                })),
            })),
        })),
    };
}

/** Count person-contact fields marked editable after enrichment (tests/diagnostics). */
export function countPersonContactEditableFields(doc: LayoutDoc): number {
    let n = 0;
    for (const item of collectLayoutItems(doc)) {
        if (item.kind === "field" && item.editable === true && isLayoutRuntimePersonContactRefKey(item.refKey ?? "")) {
            n += 1;
        }
    }
    return n;
}

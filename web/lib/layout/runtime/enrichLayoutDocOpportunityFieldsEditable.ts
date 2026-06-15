/**
 * Ensure opportunity native reference fields are editable when save path exists.
 */

import type { LayoutDoc, LayoutItem } from "@/lib/layout/layoutV2";
import { isLayoutRuntimeOpportunityNativeRefKey } from "@/lib/layout/runtime/layoutRuntimeOpportunityFieldEdit";

function enrichItem(item: LayoutItem): LayoutItem {
    if (item.kind !== "field" || !item.refKey) return item;
    if (!isLayoutRuntimeOpportunityNativeRefKey(item.refKey)) return item;
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

/** Opportunity native fields default to editable in layout runtime (save path exists). */
export function enrichLayoutDocOpportunityFieldsEditable(doc: LayoutDoc): LayoutDoc {
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

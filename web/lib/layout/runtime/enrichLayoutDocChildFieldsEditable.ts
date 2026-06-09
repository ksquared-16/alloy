/**
 * Ensure child / inquiry_child related-list columns are editable when save path exists.
 */

import type { LayoutCollectionColumn, LayoutDoc, LayoutItem } from "@/lib/layout/layoutV2";
import { normalizeRefKeyOnRead } from "@/lib/layout/layoutRefKeyAliases";
import { enrichLayoutDocPersonContactEditable } from "@/lib/layout/runtime/enrichLayoutDocPersonContactEditable";
import { isLayoutRuntimeChildEditableRefKey } from "@/lib/layout/runtime/layoutRuntimeChildFieldEdit";

function enrichColumn(col: LayoutCollectionColumn): LayoutCollectionColumn {
    const editable =
        isLayoutRuntimeChildEditableRefKey(col.refKey)
        || isLayoutRuntimeChildEditableRefKey(normalizeRefKeyOnRead(col.refKey));
    if (!editable) return col;
    if (col.editable === true) return col;
    return { ...col, editable: true };
}

function enrichItem(item: LayoutItem): LayoutItem {
    if (item.kind === "related_list" && Array.isArray(item.columns)) {
        return {
            ...item,
            columns: item.columns.map(enrichColumn),
        };
    }
    if (item.kind === "field_group") {
        const rows = item.rows?.map((row) => ({
            ...row,
            columns: row.columns.map((col) => ({
                ...col,
                items: col.items.map(enrichItem),
            })),
        }));
        const nested = item.items ? item.items.map(enrichItem) : item.items;
        return { ...item, rows, items: nested };
    }
    return item;
}

/** Child related-list columns default to editable when a save adapter exists. */
export function enrichLayoutDocChildFieldsEditable(doc: LayoutDoc): LayoutDoc {
    return {
        ...doc,
        sections: doc.sections.map((section) => ({
            ...section,
            rows: section.rows.map((row) => ({
                ...row,
                columns: row.columns.map((col) => ({
                    ...col,
                    items: col.items.map(enrichItem),
                })),
            })),
        })),
    };
}

export function enrichLayoutDocDrawerFieldEditable(doc: LayoutDoc): LayoutDoc {
    return enrichLayoutDocChildFieldsEditable(enrichLayoutDocPersonContactEditable(doc));
}

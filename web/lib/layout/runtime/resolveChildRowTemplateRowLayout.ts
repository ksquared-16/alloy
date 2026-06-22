/**
 * Child row template — map configured row groups to related-list columns for runtime.
 */

import { readLayoutEditorBlockConfig, type LayoutEditorChildRowGroup } from "@/lib/layout/layoutEditorBlockConfig";
import type { LayoutCollectionColumn, LayoutItem } from "@/lib/layout/layoutV2";

export type ChildRowTemplateRowLayout = {
    rowIndex: number;
    columnCount: number;
    /** Column per slot; undefined when slot is empty. */
    slots: Array<LayoutCollectionColumn | undefined>;
};

function childRowGroupColumnCount(group: LayoutEditorChildRowGroup): number {
    const validIndices = group.columnIndices.filter((index) => index >= 0);
    const fromIndices = validIndices.length;
    if (fromIndices === 0) return Math.max(1, group.columnCount ?? 1);
    // Honor every configured column index — stale columnCount must not drop fields.
    return Math.max(fromIndices, Math.min(3, group.columnCount ?? fromIndices));
}

export function resolveChildRowTemplateRowLayout(item: LayoutItem): ChildRowTemplateRowLayout[] | null {
    if (item.kind !== "related_list") return null;
    const groups = readLayoutEditorBlockConfig(item.metadata).childRowGroups;
    if (!groups?.length) return null;
    const allColumns = item.columns ?? [];
    return groups.map((group, rowIndex) => {
        const columnCount = childRowGroupColumnCount(group);
        const slots = Array.from({ length: columnCount }, (_, slot) => {
            const colIdx = group.columnIndices[slot];
            return colIdx != null && colIdx >= 0 ? allColumns[colIdx] : undefined;
        });
        return { rowIndex, columnCount, slots };
    });
}

export function childRowTemplateUsesConfiguredLayout(item: LayoutItem): boolean {
    return resolveChildRowTemplateRowLayout(item) != null;
}

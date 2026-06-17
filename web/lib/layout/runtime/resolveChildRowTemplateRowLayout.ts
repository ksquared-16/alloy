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
    return Math.max(1, group.columnCount ?? (group.columnIndices.length || 1));
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

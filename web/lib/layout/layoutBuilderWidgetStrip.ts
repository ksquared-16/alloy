/**
 * Experience Builder — widget strip presentation helpers (no LayoutDoc mutations).
 */

import { listSectionCompositionRows } from "@/lib/layout/layoutEditorSectionComposition";
import { readSectionType, sectionHasWidgetItems } from "@/lib/layout/layoutEditorSectionLayout";
import { resolveOpportunityDrawerSectionZone } from "@/lib/layout/opportunityDrawerLayoutEditorModel";
import type { LayoutDoc, LayoutSection } from "@/lib/layout/layoutV2";
import type { SectionCompositionItem } from "@/lib/layout/layoutEditorSectionComposition";

export function sectionIsWidgetStrip(section: LayoutSection): boolean {
    if (readSectionType(section) === "widget") return true;
    if (resolveOpportunityDrawerSectionZone(section) === "summary_strip" && sectionHasWidgetItems(section)) return true;
    return false;
}

export function listSectionWidgetItems(doc: LayoutDoc, sectionKey: string): SectionCompositionItem[] {
    const rows = listSectionCompositionRows(doc, sectionKey);
    return rows.flatMap((row) => row.columns.flatMap((col) => col.items)).filter((item) => item.kind === "widget");
}

export function widgetStripColumnCount(doc: LayoutDoc, sectionKey: string): number {
    const rows = listSectionCompositionRows(doc, sectionKey);
    const firstRow = rows[0];
    if (!firstRow) return 1;
    const widgetCols = firstRow.columns.filter((col) => col.items.some((it) => it.kind === "widget"));
    return Math.min(4, Math.max(1, widgetCols.length || firstRow.columnCount));
}

export const WIDGET_STRIP_WIDTH_PRESETS = [
    { key: "1", label: "1 widget", count: 1 },
    { key: "2", label: "2 widgets", count: 2 },
    { key: "3", label: "3 widgets", count: 3 },
    { key: "4", label: "4 widgets", count: 4 },
] as const;

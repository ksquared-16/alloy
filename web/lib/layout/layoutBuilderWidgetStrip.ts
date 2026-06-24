/**
 * Experience Builder — widget strip presentation helpers (no LayoutDoc mutations).
 */

import { listSectionCompositionRows } from "@/lib/layout/layoutEditorSectionComposition";
import { readSectionType, sectionHasWidgetItems } from "@/lib/layout/layoutEditorSectionLayout";
import { LAYOUT_EDITOR_KPI_TILE_METADATA_KEY } from "@/lib/layout/layoutBuilderKpiTileRows";
import { patchSection } from "@/lib/layout/builderOps";
import { resolveOpportunityDrawerSectionZone } from "@/lib/layout/opportunityDrawerLayoutEditorModel";
import type { LayoutDoc, LayoutSection } from "@/lib/layout/layoutV2";
import type { SectionCompositionItem } from "@/lib/layout/layoutEditorSectionComposition";

function patchSectionMetadata(
    doc: LayoutDoc,
    sectionKey: string,
    patch: (metadata: Record<string, unknown>) => Record<string, unknown>,
): LayoutDoc {
    const sIdx = doc.sections.findIndex((s) => s.key === sectionKey);
    if (sIdx < 0) return doc;
    const section = doc.sections[sIdx]!;
    const metadata = patch({ ...(section.metadata ?? {}) });
    return patchSection(doc, sIdx, { metadata });
}

function countSectionWidgets(section: LayoutSection): number {
    return section.rows.reduce(
        (total, row) =>
            total
            + row.columns.reduce(
                (colTotal, col) =>
                    colTotal + col.items.filter((item) => item.kind === "widget_placeholder").length,
                0,
            ),
        0,
    );
}

export const LAYOUT_EDITOR_WIDGET_CARD_METADATA_KEY = "layoutEditorWidgetCard" as const;

/** Widget keys that render as full-width/right-rail cards — not summary-strip KPI tiles. */
export const LAYOUT_BUILDER_WIDGET_CARD_WIDGET_KEYS = new Set([
    "documents",
    "activity",
    "activity_timeline",
]);

export function isLayoutBuilderWidgetCardWidgetKey(widgetKey: string): boolean {
    return LAYOUT_BUILDER_WIDGET_CARD_WIDGET_KEYS.has(widgetKey.trim());
}

export function markSectionAsWidgetCard(doc: LayoutDoc, sectionKey: string): LayoutDoc {
    return patchSectionMetadata(doc, sectionKey, (metadata) => {
        const next: Record<string, unknown> = { ...metadata };
        next[LAYOUT_EDITOR_WIDGET_CARD_METADATA_KEY] = true;
        delete next[LAYOUT_EDITOR_KPI_TILE_METADATA_KEY];
        return next;
    });
}

/** Single-widget KPI tile — first-class surface block, not a card wrapper. */
export function sectionIsKpiTile(section: LayoutSection): boolean {
    if (section.metadata?.[LAYOUT_EDITOR_WIDGET_CARD_METADATA_KEY] === true) return false;
    if (section.metadata?.[LAYOUT_EDITOR_KPI_TILE_METADATA_KEY] === true) return true;
    if (readSectionType(section) !== "widget") return false;
    const layoutZone = section.metadata?.layoutZone;
    if (layoutZone === "right_rail" || layoutZone === "main" || layoutZone === "footer_actions") return false;
    return countSectionWidgets(section) === 1;
}

/** True when a card hosts multiple KPI widgets in one row (legacy strip layout). */
export function sectionIsWidgetStrip(section: LayoutSection): boolean {
    if (sectionIsKpiTile(section)) return false;
    const widgetCount = countSectionWidgets(section);
    if (widgetCount <= 1) return false;
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

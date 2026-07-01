/**
 * Walk a layout section tree to detect configured widget placeholders.
 */

import type { LayoutItem, LayoutSection } from "@/lib/layout/layoutV2";
import { resolveLayoutRuntimeWidgetKey } from "@/lib/layout/runtime/resolveLayoutRuntimeWidgetKey";

function walkItems(items: LayoutItem[], widgetKey: string): boolean {
    for (const item of items) {
        if (item.kind === "widget_placeholder" && resolveLayoutRuntimeWidgetKey(item) === widgetKey) {
            return true;
        }
        if (item.kind === "field_group" && Array.isArray(item.rows)) {
            for (const row of item.rows) {
                for (const col of row.columns) {
                    if (walkItems(col.items, widgetKey)) return true;
                }
            }
        }
    }
    return false;
}

/** True when the section doc includes a widget placeholder with the given key. */
export function layoutSectionIncludesWidget(section: LayoutSection, widgetKey: string): boolean {
    for (const row of section.rows) {
        for (const col of row.columns) {
            if (walkItems(col.items, widgetKey)) return true;
        }
    }
    return false;
}

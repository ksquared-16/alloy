/**
 * C1b — production layout runtime item support.
 *
 * Configured drawer items render structure (labels + placeholders). Future-module
 * widgets render a visible placeholder; they are not silently omitted.
 */

import type { LayoutItem } from "../layoutV2";
import { shouldRenderProofItem } from "./resolveProofBindingValue";

/** True when a layout item may render in production/preview drawer body. */
export function isLayoutItemSupportedForProduction(item: LayoutItem): boolean {
    if (!shouldRenderProofItem(item)) return false;
    if (item.kind === "widget_placeholder") return true;
    if (item.kind === "related_list" && item.displayMode !== "table" && item.displayMode !== "rows") {
        return false;
    }
    return true;
}

/** True when at least one production-supported item exists in the doc. */
export function layoutDocHasProductionSupportedItems(items: LayoutItem[]): boolean {
    return items.some(isLayoutItemSupportedForProduction);
}

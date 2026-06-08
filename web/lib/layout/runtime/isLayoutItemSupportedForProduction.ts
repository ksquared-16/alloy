/**
 * C1b — production layout runtime item support (fail-closed).
 *
 * Unsupported items are omitted from operator UI; they do not crash the body.
 */

import type { LayoutItem } from "../layoutV2";
import { FUTURE_MODULE_METADATA_KEY } from "./proofLayoutHelpers";
import { shouldRenderProofItem } from "./resolveProofBindingValue";

const PRODUCTION_WIDGET_KEYS = new Set(["tasks", "reminders"]);

/** True when a layout item may render in production drawer body. */
export function isLayoutItemSupportedForProduction(item: LayoutItem): boolean {
    if (!shouldRenderProofItem(item)) return false;
    if (item.metadata?.[FUTURE_MODULE_METADATA_KEY] === true) return false;

    if (item.kind === "widget_placeholder") {
        return PRODUCTION_WIDGET_KEYS.has(item.refKey);
    }

    return true;
}

/** True when at least one production-supported item exists in the doc. */
export function layoutDocHasProductionSupportedItems(items: LayoutItem[]): boolean {
    return items.some(isLayoutItemSupportedForProduction);
}

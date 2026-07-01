/**
 * Shared layout doc renderability check for production drawer/queue runtime.
 */

import type { LayoutDoc } from "../layoutV2";
import { collectLayoutItems } from "./classifyLayoutItemBinding";
import { layoutDocHasProductionSupportedItems, isLayoutItemSupportedForProduction } from "./isLayoutItemSupportedForProduction";
import { layoutDocSupportsAllSprint1ItemKinds } from "./layoutRuntimePlan";

export function isLayoutDocRenderableForProduction(doc: LayoutDoc | null | undefined): boolean {
    if (!doc?.sections?.length) return false;
    if (!layoutDocSupportsAllSprint1ItemKinds(doc)) return false;
    const items = collectLayoutItems(doc);
    return layoutDocHasProductionSupportedItems(items);
}

export function filterProductionSupportedLayoutItems(items: ReturnType<typeof collectLayoutItems>) {
    return items.filter(isLayoutItemSupportedForProduction);
}

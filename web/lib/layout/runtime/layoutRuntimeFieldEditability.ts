/**
 * Generic layout-runtime field editability gate.
 */

import type { LayoutItem } from "@/lib/layout/layoutV2";
import { isLayoutRuntimeChildEditableRefKey } from "@/lib/layout/runtime/layoutRuntimeChildFieldEdit";
import { isLayoutRuntimePersonContactRefKey } from "@/lib/layout/runtime/layoutRuntimePersonContactEdit";

export type LayoutRuntimeSurfaceVariant = "proof" | "production" | "preview";

/** RefKeys with a registered layout-runtime save adapter. */
export function isLayoutRuntimeEditableRefKeySupported(refKey: string): boolean {
    if (isLayoutRuntimePersonContactRefKey(refKey)) return true;
    return isLayoutRuntimeChildEditableRefKey(refKey);
}

/** Whether one layout item should render an input in production runtime. */
export function layoutRuntimeFieldIsEditable(
    item: Pick<LayoutItem, "editable" | "refKey">,
    variant: LayoutRuntimeSurfaceVariant,
): boolean {
    if (variant !== "production") return false;
    if (item.editable !== true) return false;
    const refKey = item.refKey?.trim() ?? "";
    if (!refKey) return false;
    return isLayoutRuntimeEditableRefKeySupported(refKey);
}

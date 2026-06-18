/**
 * Generic layout-runtime field editability gate.
 */

import type { LayoutItem } from "@/lib/layout/layoutV2";
import { normalizeRefKeyOnRead } from "@/lib/layout/layoutRefKeyAliases";
import { isLayoutRuntimeChildEditableRefKey } from "@/lib/layout/runtime/layoutRuntimeChildFieldEdit";
import { isLayoutRuntimeOpportunityNativeRefKey } from "@/lib/layout/runtime/layoutRuntimeOpportunityFieldEdit";
import { isLayoutRuntimePersonContactRefKey } from "@/lib/layout/runtime/layoutRuntimePersonContactEdit";

export type LayoutRuntimeSurfaceVariant = "proof" | "production" | "preview";

export const LAYOUT_RUNTIME_OPPORTUNITY_LOCATION_DISPLAY_REF = "opportunity.location";
export const LAYOUT_RUNTIME_OPPORTUNITY_LOCATION_EDIT_REF = "opportunity.location_id";

/** Map display-only location label ref to native editable location_id. */
export function resolveLayoutRuntimeEditableRefKey(refKey: string): string {
    const normalized = normalizeRefKeyOnRead(refKey.trim());
    if (normalized === LAYOUT_RUNTIME_OPPORTUNITY_LOCATION_DISPLAY_REF) {
        return LAYOUT_RUNTIME_OPPORTUNITY_LOCATION_EDIT_REF;
    }
    return normalized;
}

/** RefKeys with a registered layout-runtime save adapter. */
export function isLayoutRuntimeEditableRefKeySupported(refKey: string): boolean {
    const resolved = resolveLayoutRuntimeEditableRefKey(refKey);
    if (isLayoutRuntimePersonContactRefKey(resolved)) return true;
    if (isLayoutRuntimeOpportunityNativeRefKey(resolved)) return true;
    return isLayoutRuntimeChildEditableRefKey(resolved);
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

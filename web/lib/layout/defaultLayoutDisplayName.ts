/**
 * Operator-friendly default display names for new layout drafts.
 */

import type { LayoutDoc } from "@/lib/layout/layoutV2";
import { resolveSurfaceLayoutKeyFromDoc, getSurfaceLayoutRegistryEntry } from "@/lib/layout/surfaceLayoutRegistry";

/** Default stable title when creating a layout from surface seed. */
export function defaultLayoutDisplayNameForDoc(doc: LayoutDoc, fallbackEntityType: string, fallbackSurface: string): string {
    const surfaceKey = resolveSurfaceLayoutKeyFromDoc(doc);
    if (surfaceKey) {
        const entry = getSurfaceLayoutRegistryEntry(surfaceKey);
        if (entry?.label) return entry.label;
    }
    return `${fallbackEntityType} ${fallbackSurface} layout`;
}

import { canonicalLocationSettingsHref } from "@/lib/admin/canonicalLocationSettingsRoutes";
import { resolveGlobalSearchDrawerOpenTarget } from "@/lib/admin/globalSearch/globalRecordSearchDrawerTarget";
import type { GlobalRecordSearchHit } from "@/lib/admin/globalSearch/globalRecordSearchTypes";

/** Campus / location search hits open canonical Settings, not the legacy drawer. */
export function resolveGlobalSearchLocationSettingsHref(hit: GlobalRecordSearchHit): string | null {
    const target = resolveGlobalSearchDrawerOpenTarget(hit);
    if (!target || target.entity_type !== "locations") return null;
    return canonicalLocationSettingsHref(target.entity_id);
}

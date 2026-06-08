import {
    accessScopeRestrictsData,
    type AdminAccessScopeDimensions,
} from "@/lib/admin/accessScope";

/** True when a resolved record location is visible under current site access. */
export function globalSearchRecordAllowedBySiteScope(
    locationId: string | null | undefined,
    accessDim: AdminAccessScopeDimensions
): boolean {
    if (!accessScopeRestrictsData(accessDim) || accessDim.siteScope !== "restricted") {
        return true;
    }
    const allowed = (accessDim.allowedSiteLocationIds ?? []).map(String).filter(Boolean);
    if (!allowed.length) return false;
    const loc = locationId != null ? String(locationId).trim() : "";
    if (!loc) return false;
    return allowed.includes(loc);
}

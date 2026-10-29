import type { SupabaseClient } from "@supabase/supabase-js";
import {
    departmentIdAllowed,
    fetchWorkUnitDepartmentId,
    locationAllowedUnderSiteScope,
    type AdminAccessScopeDimensions,
} from "@/lib/admin/accessScope";

/** Returns false when site_id is out of operator access scope. */
export async function assertMetricSiteAccess(params: {
    supabase: SupabaseClient;
    orgId: string;
    scope: AdminAccessScopeDimensions;
    siteId: string | null;
}): Promise<boolean> {
    if (!params.siteId) return true;
    return locationAllowedUnderSiteScope(params.supabase, params.orgId, params.scope, params.siteId);
}

/**
 * WS0-A — returns false when work_unit_id is not inside the caller's department scope.
 *
 * `work_unit_id` used to pass straight from the query string into the engine. Most resolvers
 * intersect it with the caller's constraints anyway, but the Enrollment counts EXPAND a work unit to
 * its whole department footprint, so a department-restricted caller could name another
 * department's work unit and read its counts. A work unit is admitted the way a site is: before any
 * resolver runs. (`fetchWorkUnitDepartmentId` is org-filtered, so a foreign work unit has no
 * department and is refused.)
 */
export async function assertMetricWorkUnitAccess(params: {
    supabase: SupabaseClient;
    orgId: string;
    scope: AdminAccessScopeDimensions;
    workUnitId: string | null;
}): Promise<boolean> {
    if (!params.workUnitId) return true;
    if (params.scope.departmentScope === "all") return true;
    const departmentId = await fetchWorkUnitDepartmentId(params.supabase, params.orgId, params.workUnitId);
    return departmentIdAllowed(params.scope, departmentId);
}

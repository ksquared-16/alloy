import type { SupabaseClient } from "@supabase/supabase-js";
import { locationAllowedUnderSiteScope, type AdminAccessScopeDimensions } from "@/lib/admin/accessScope";

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

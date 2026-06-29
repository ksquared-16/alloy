import { redirect } from "next/navigation";

import { getAdminAccessContextCached } from "@/lib/admin/getAdminAccessContext";
import { scopeDimensionsFromAccess } from "@/lib/admin/accessScope";
import { createAdminClient } from "@/lib/supabaseAdmin";
import { resolveOrgSiteLocationsForAdmin } from "@/lib/admin/resolveOrgSiteLocations";
import { decodeAnalyticsFilters } from "@/lib/analytics/runtime/analyticsContextUrl";
import { metricWindowFromPeriod } from "@/lib/analytics/runtime/metricWindow";
import { siteAllowlistForScope, sanitizeSiteId } from "@/lib/analytics/runtime/operationalSurfaceModel";
import { buildOperationalSurfaceModel } from "@/lib/analytics/runtime/operationalSurface";
import type { AnalyticsContextScope } from "@/lib/analytics/runtime/AnalyticsContextProvider";
import { OperationalIntelligenceClient } from "@/components/adminV2/intelligence/OperationalIntelligenceClient";

export const dynamic = "force-dynamic";

/**
 * Production Operational Intelligence surface.
 *
 * Server-resolves real OIP metrics + a scoped opportunity breakdown, builds drill
 * hrefs via DrillResolver, and renders the approved Slice 2 visual language. Filter
 * state lives in the URL; changing it re-runs this server component with new scope.
 */
export default async function OperationalIntelligencePage({
    searchParams,
}: {
    searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
    const access = await getAdminAccessContextCached();
    if (!access.ok) {
        redirect("/unauthorized");
    }

    const sp = await searchParams;
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(sp)) {
        if (typeof value === "string") params.set(key, value);
        else if (Array.isArray(value) && typeof value[0] === "string") params.set(key, value[0]);
    }

    const filters = decodeAnalyticsFilters(params);
    const windowKey = metricWindowFromPeriod(filters.dateRange);
    const compareOn = Boolean(filters.comparisonPeriod);

    const supabase = createAdminClient();
    const accessScope = scopeDimensionsFromAccess(access);

    // Only accessible sites are listed; a URL-injected inaccessible site is ignored.
    const siteOptions = await resolveOrgSiteLocationsForAdmin(supabase, access.orgId, {
        allowedSiteLocationIds: siteAllowlistForScope(accessScope),
    });
    const siteId = sanitizeSiteId(filters.siteLocationIds?.[0] ?? null, siteOptions);

    const model = await buildOperationalSurfaceModel({
        supabase,
        orgId: access.orgId,
        accessScope,
        windowKey,
        siteId,
        siteOptions,
        compareOn,
    });

    const scope: AnalyticsContextScope = {
        orgId: access.orgId,
        accessScope,
        surfaceId: "operational",
    };

    return (
        <div className="p-5">
            <OperationalIntelligenceClient scope={scope} model={model} />
        </div>
    );
}

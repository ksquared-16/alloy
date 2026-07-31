import { NextRequest, NextResponse } from "next/server";

import { requireAnalyticsReadAccess } from "@/lib/admin/canReadAnalytics";
import { scopeDimensionsFromAccess } from "@/lib/admin/accessScope";
import { createAdminClient } from "@/lib/supabaseAdmin";
import { resolveOrgSiteLocationsForAdmin } from "@/lib/admin/resolveOrgSiteLocations";
import { parseMetricTimeWindow } from "@/lib/metrics/timeWindow";
import type { MetricTimeWindowKey } from "@/lib/metrics/types";
import { siteAllowlistForScope, sanitizeSiteId } from "@/lib/analytics/runtime/operationalSurfaceModel";
import { buildOperationalSurfaceModel } from "@/lib/analytics/runtime/operationalSurface";

export const dynamic = "force-dynamic";

/**
 * GET /api/admin/intelligence/operational
 *
 * Data endpoint (NOT a product surface) for the Operational Intelligence runtime,
 * which renders inside the existing Workspace → Analytics modal. Wraps the shared
 * server model builder so the modal reuses the same real-data resolution as the
 * (removed) standalone route. Routes here are an implementation detail.
 *
 * Query: site_id, window (rolling_24h|7d|30d), compare (1 = prior-period deltas)
 */
export async function GET(request: NextRequest) {
    const auth = await requireAnalyticsReadAccess();
    if (!auth.ok) return auth.response;
    const { access } = auth;

    const { searchParams } = new URL(request.url);
    const supabase = createAdminClient();
    const accessScope = scopeDimensionsFromAccess(access);

    const siteOptions = await resolveOrgSiteLocationsForAdmin(supabase, access.orgId, {
        allowedSiteLocationIds: siteAllowlistForScope(accessScope),
    });
    const siteId = sanitizeSiteId(searchParams.get("site_id"), siteOptions);

    const windowKey: MetricTimeWindowKey = parseMetricTimeWindow(searchParams.get("window") ?? "") ?? "rolling_30d";
    const compareOn = searchParams.get("compare") === "1";

    const model = await buildOperationalSurfaceModel({
        supabase,
        orgId: access.orgId,
        accessScope,
        windowKey,
        siteId,
        siteOptions,
        compareOn,
    });

    return NextResponse.json(model);
}

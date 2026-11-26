import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabaseAdmin";
import { requireAnalyticsV2AdminContext } from "@/lib/metrics/platform/adminApiHelpers";
import { renderMetricPlacementsForSurface, renderMetricPlacementsByZone } from "@/lib/metrics/platform/renderMetricPlacements";
import type { MetricSurface } from "@/lib/metrics/platform/types";
import { requireAnalyticsReadAccess } from "@/lib/admin/canReadAnalytics";
import { locationAllowedUnderSiteScope, scopeDimensionsFromAccess } from "@/lib/admin/accessScope";
import { snapshotReadableForScope } from "@/lib/metrics/metricScopeGuard";

export const dynamic = "force-dynamic";

const VALID_SURFACES = new Set<string>([
    "workspace_header",
    "business_process_tile",
    "work_unit_header",
    "drawer",
    "operational_intelligence",
    "dashboard",
    "report",
    "portal",
    "mobile",
]);

const OI_ZONES = ["overview", "health", "trends", "comparisons"] as const;

/** GET /api/admin/analytics/render — snapshot-first placement bundle for a surface. */
export async function GET(request: NextRequest) {
    /*
     * WS0-A — this returns stored metric VALUES, so it is an analytics read: `reports.read` (or
     * `reports.write`), like every sibling value route. It was reachable through org admission
     * alone.
     */
    const analyticsAuth = await requireAnalyticsReadAccess();
    if (!analyticsAuth.ok) return analyticsAuth.response;

    const gate = await requireAnalyticsV2AdminContext();
    if (!gate.ok) return gate.response;

    const surface = request.nextUrl.searchParams.get("surface");
    if (!surface || !VALID_SURFACES.has(surface)) {
        return NextResponse.json({ error: "Invalid surface" }, { status: 400 });
    }

    const surfaceKey = request.nextUrl.searchParams.get("surface_key") ?? "default";
    const placementZone = request.nextUrl.searchParams.get("placement_zone") ?? undefined;
    const contextType = request.nextUrl.searchParams.get("context_type") ?? "org";
    const contextId = request.nextUrl.searchParams.get("context_id");

    /*
     * WS0-A — every value here is a canonical platform snapshot for `context_type`/`context_id`.
     * A caller whose access is narrower than that context may not read it (the org bundle by
     * omitting the context, or another site's by naming it).
     */
    const scope = scopeDimensionsFromAccess(analyticsAuth.access);
    const contextSiteAllowed =
        contextType !== "site" || !contextId || (await locationAllowedUnderSiteScope(
            createAdminClient(), gate.ctx.orgId, scope, contextId,
        ));
    if (!contextSiteAllowed || !snapshotReadableForScope(scope, contextType, contextId ?? null)) {
        return NextResponse.json({ error: "Context not in access scope" }, { status: 403 });
    }

    const supabase = createAdminClient();
    const baseParams = {
        supabase,
        orgId: gate.ctx.orgId,
        surface: surface as MetricSurface,
        surfaceKey,
        contextType,
        contextId: contextId ?? null,
    };

    if (surface === "operational_intelligence" && !placementZone) {
        const zones = await renderMetricPlacementsByZone({ ...baseParams, zones: OI_ZONES });
        return NextResponse.json({ zones, surface, surface_key: surfaceKey });
    }

    const items = await renderMetricPlacementsForSurface({ ...baseParams, placementZone });
    return NextResponse.json({ items, surface, surface_key: surfaceKey, placement_zone: placementZone ?? null });
}

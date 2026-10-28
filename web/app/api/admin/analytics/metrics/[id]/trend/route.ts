import { NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabaseAdmin";
import { requireAnalyticsV2AdminContext, metricValidationError } from "@/lib/metrics/platform/adminApiHelpers";
import { loadMetricDefinitionById } from "@/lib/metrics/platform/placementResolver";
import { getMetricPlatformSnapshotSeries } from "@/lib/metrics/platform/metricSnapshots";
import { comparePeriodOverPeriod } from "@/lib/metrics/platform/metricTrends";
import { evaluateMetricDefinition } from "@/lib/metrics/platform/metricEvaluator";
import { getAdminAccessContextCached } from "@/lib/admin/getAdminAccessContext";
import { adminContextFailureResponse } from "@/lib/admin/getAdminContext";
import { scopeDimensionsFromAccess } from "@/lib/admin/accessScope";
import { apiOk, apiError } from "@/lib/api/apiResponse";
import { snapshotReadableForScope } from "@/lib/metrics/metricScopeGuard";
import { requireAnalyticsReadAccess } from "@/lib/admin/canReadAnalytics";

export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(request: NextRequest, context: RouteContext) {
    // WS0-A — returns stored and evaluated metric VALUES: an analytics read, like its siblings.
    const analyticsAuth = await requireAnalyticsReadAccess();
    if (!analyticsAuth.ok) return analyticsAuth.response;

    const gate = await requireAnalyticsV2AdminContext();
    if (!gate.ok) return gate.response;

    const { id } = await context.params;
    const supabase = createAdminClient();
    const definition = await loadMetricDefinitionById(supabase, gate.ctx.orgId, id);
    if (!definition) return apiError("NOT_FOUND", "Not found", 404, undefined, { request });

    const access = await getAdminAccessContextCached();
    if (!access.ok) return adminContextFailureResponse(access);

    /*
     * WS0-A — the series is ORG-context canonical snapshots. It used to read every context's rows
     * (org, sites, work units) as one series, and to serve them to any caller. Only an unrestricted
     * caller may read the org series; a restricted caller gets their own live evaluation.
     */
    const series = snapshotReadableForScope(scopeDimensionsFromAccess(access), "org", null)
        ? await getMetricPlatformSnapshotSeries(supabase, {
              orgId: gate.ctx.orgId,
              metricDefinitionId: id,
              contextType: "org",
              contextId: null,
              limit: 30,
          })
        : [];

    let comparison = null;
    if (series.length >= 2) {
        comparison = comparePeriodOverPeriod({
            current: series[series.length - 1]!,
            previous: series[series.length - 2]!,
            target: definition.target_config,
        });
    } else {
        try {
            const current = await evaluateMetricDefinition({
                supabase,
                definition,
                ctx: { orgId: gate.ctx.orgId },
                accessScope: scopeDimensionsFromAccess(access),
            });
            comparison = comparePeriodOverPeriod({ current, previous: null, target: definition.target_config });
        } catch (e) {
            return metricValidationError(e, request);
        }
    }

    return apiOk(
        {
            series: series.map((s) => ({
                computed_at: s.computed_at,
                value: s.value,
                health_state: s.health_state,
            })),
            comparison,
        },
        { request }
    );
}

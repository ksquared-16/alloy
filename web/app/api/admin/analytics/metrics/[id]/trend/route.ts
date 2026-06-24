import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabaseAdmin";
import { requireAnalyticsV2AdminContext, zodErrorResponse } from "@/lib/metrics/platform/adminApiHelpers";
import { loadMetricDefinitionById } from "@/lib/metrics/platform/placementResolver";
import { getMetricPlatformSnapshotSeries } from "@/lib/metrics/platform/metricSnapshots";
import { comparePeriodOverPeriod } from "@/lib/metrics/platform/metricTrends";
import { evaluateMetricDefinition } from "@/lib/metrics/platform/metricEvaluator";
import { getAdminAccessContextCached } from "@/lib/admin/getAdminAccessContext";
import { adminContextFailureResponse } from "@/lib/admin/getAdminContext";
import { scopeDimensionsFromAccess } from "@/lib/admin/accessScope";

export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(_request: NextRequest, context: RouteContext) {
    const gate = await requireAnalyticsV2AdminContext();
    if (!gate.ok) return gate.response;

    const { id } = await context.params;
    const supabase = createAdminClient();
    const definition = await loadMetricDefinitionById(supabase, gate.ctx.orgId, id);
    if (!definition) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const series = await getMetricPlatformSnapshotSeries(supabase, {
        orgId: gate.ctx.orgId,
        metricDefinitionId: id,
        limit: 30,
    });

    let comparison = null;
    if (series.length >= 2) {
        comparison = comparePeriodOverPeriod({
            current: series[series.length - 1]!,
            previous: series[series.length - 2]!,
            target: definition.target_config,
        });
    } else {
        const access = await getAdminAccessContextCached();
        if (!access.ok) return adminContextFailureResponse(access);
        try {
            const current = await evaluateMetricDefinition({
                supabase,
                definition,
                ctx: { orgId: gate.ctx.orgId },
                accessScope: scopeDimensionsFromAccess(access),
            });
            comparison = comparePeriodOverPeriod({ current, previous: null, target: definition.target_config });
        } catch (e) {
            return zodErrorResponse(e);
        }
    }

    return NextResponse.json({
        series: series.map((s) => ({
            computed_at: s.computed_at,
            value: s.value,
            health_state: s.health_state,
        })),
        comparison,
    });
}

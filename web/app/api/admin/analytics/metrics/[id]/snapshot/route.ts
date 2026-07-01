import { NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabaseAdmin";
import { getAdminAccessContextCached } from "@/lib/admin/getAdminAccessContext";
import { adminContextFailureResponse } from "@/lib/admin/getAdminContext";
import { requireAnalyticsV2AdminMutate } from "@/lib/metrics/platform/adminApiHelpers";
import { loadMetricDefinitionById } from "@/lib/metrics/platform/placementResolver";
import { evaluateAndSnapshotMetric } from "@/lib/metrics/platform/metricSnapshots";
import { apiOk, apiError } from "@/lib/api/apiResponse";

export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string }> };

export async function POST(request: NextRequest, context: RouteContext) {
    const gate = await requireAnalyticsV2AdminMutate();
    if (!gate.ok) return gate.response;

    const { id } = await context.params;
    const supabase = createAdminClient();
    const definition = await loadMetricDefinitionById(supabase, gate.ctx.orgId, id);
    if (!definition) return apiError("NOT_FOUND", "Not found", 404, undefined, { request });

    const access = await getAdminAccessContextCached();
    if (!access.ok) return adminContextFailureResponse(access);

    const result = await evaluateAndSnapshotMetric({
        supabase,
        definition,
        ctx: { orgId: gate.ctx.orgId },
    });

    if (result.error) return apiError("INTERNAL", result.error, 500, undefined, { request });

    return apiOk({ evaluation: result.evaluation, snapshot_id: result.snapshotId }, { request });
}

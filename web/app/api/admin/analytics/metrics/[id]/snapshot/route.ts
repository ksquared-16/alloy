import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabaseAdmin";
import { getAdminAccessContextCached } from "@/lib/admin/getAdminAccessContext";
import { adminContextFailureResponse } from "@/lib/admin/getAdminContext";
import { scopeDimensionsFromAccess } from "@/lib/admin/accessScope";
import { requireAnalyticsV2AdminMutate } from "@/lib/metrics/platform/adminApiHelpers";
import { loadMetricDefinitionById } from "@/lib/metrics/platform/placementResolver";
import { evaluateAndSnapshotMetric } from "@/lib/metrics/platform/metricSnapshots";

export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string }> };

export async function POST(_request: NextRequest, context: RouteContext) {
    const gate = await requireAnalyticsV2AdminMutate();
    if (!gate.ok) return gate.response;

    const { id } = await context.params;
    const supabase = createAdminClient();
    const definition = await loadMetricDefinitionById(supabase, gate.ctx.orgId, id);
    if (!definition) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const access = await getAdminAccessContextCached();
    if (!access.ok) return adminContextFailureResponse(access);

    const result = await evaluateAndSnapshotMetric({
        supabase,
        definition,
        ctx: { orgId: gate.ctx.orgId },
    });

    if (result.error) return NextResponse.json({ error: result.error }, { status: 500 });

    return NextResponse.json({
        evaluation: result.evaluation,
        snapshot_id: result.snapshotId,
    });
}

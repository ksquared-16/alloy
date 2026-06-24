import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabaseAdmin";
import { requireAnalyticsV2AdminMutate } from "@/lib/metrics/platform/adminApiHelpers";
import { copyGlobalVisualizationToOrg } from "@/lib/metrics/platform/copyTemplate";

export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string }> };

/** POST /api/admin/analytics/visualizations/[id]/copy — copy global visualization to org. */
export async function POST(request: NextRequest, context: RouteContext) {
    const gate = await requireAnalyticsV2AdminMutate();
    if (!gate.ok) return gate.response;

    const { id } = await context.params;
    let body: { metric_definition_id?: string } = {};
    try {
        body = (await request.json()) as { metric_definition_id?: string };
    } catch {
        // optional body
    }

    const orgMetricId = body.metric_definition_id?.trim();
    if (!orgMetricId) {
        return NextResponse.json({ error: "metric_definition_id required for org copy" }, { status: 400 });
    }

    const supabase = createAdminClient();
    const { data: source } = await supabase.from("metric_visualizations").select("*").eq("id", id).maybeSingle();
    if (!source) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const { data: orgMetric } = await supabase
        .from("metric_definitions")
        .select("id")
        .eq("id", orgMetricId)
        .eq("org_id", gate.ctx.orgId)
        .maybeSingle();
    if (!orgMetric) {
        return NextResponse.json({ error: "Org metric definition not found" }, { status: 400 });
    }

    const result = await copyGlobalVisualizationToOrg(supabase, gate.ctx.orgId, id, orgMetricId);
    if (result.error && !result.item) {
        return NextResponse.json({ error: result.error }, { status: 400 });
    }

    return NextResponse.json({ item: result.item, copied: result.copied });
}

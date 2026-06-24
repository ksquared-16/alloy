import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabaseAdmin";
import { requireAnalyticsV2AdminContext, requireAnalyticsV2AdminMutate, zodErrorResponse } from "@/lib/metrics/platform/adminApiHelpers";
import { validateMetricVisualizationCreate } from "@/lib/metrics/platform/metricVisualizationSchema";
import { loadMetricVisualizationsForOrg } from "@/lib/metrics/platform/placementResolver";

export const dynamic = "force-dynamic";

export async function GET() {
    const gate = await requireAnalyticsV2AdminContext();
    if (!gate.ok) return gate.response;

    const supabase = createAdminClient();
    const items = await loadMetricVisualizationsForOrg(supabase, gate.ctx.orgId);
    return NextResponse.json({ items });
}

export async function POST(request: NextRequest) {
    const gate = await requireAnalyticsV2AdminMutate();
    if (!gate.ok) return gate.response;

    let body: unknown;
    try {
        body = await request.json();
    } catch {
        return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
    }

    try {
        const input = validateMetricVisualizationCreate(body);
        const supabase = createAdminClient();
        const { data, error } = await supabase
            .from("metric_visualizations")
            .insert({
                org_id: gate.ctx.orgId,
                metric_definition_id: input.metric_definition_id,
                key: input.key,
                label: input.label,
                visualization_type: input.visualization_type,
                style_config: input.style_config ?? { version: 1 },
                display_config: input.display_config ?? { version: 1 },
                status: input.status ?? "draft",
                version: 1,
            })
            .select("*")
            .single();

        if (error) return NextResponse.json({ error: error.message }, { status: 400 });
        return NextResponse.json({ item: data }, { status: 201 });
    } catch (e) {
        return zodErrorResponse(e);
    }
}

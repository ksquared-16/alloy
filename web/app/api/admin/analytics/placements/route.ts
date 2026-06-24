import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabaseAdmin";
import { requireAnalyticsV2AdminContext, requireAnalyticsV2AdminMutate, zodErrorResponse } from "@/lib/metrics/platform/adminApiHelpers";
import { validateMetricPlacementCreate } from "@/lib/metrics/platform/metricPlacementSchema";
import { loadMetricPlacementsForOrg } from "@/lib/metrics/platform/placementResolver";

export const dynamic = "force-dynamic";

export async function GET() {
    const gate = await requireAnalyticsV2AdminContext();
    if (!gate.ok) return gate.response;

    const supabase = createAdminClient();
    const items = await loadMetricPlacementsForOrg(supabase, gate.ctx.orgId);
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
        const input = validateMetricPlacementCreate(body);
        const supabase = createAdminClient();
        const { data, error } = await supabase
            .from("metric_placements")
            .insert({
                org_id: gate.ctx.orgId,
                visualization_id: input.visualization_id,
                surface: input.surface,
                surface_key: input.surface_key ?? "default",
                placement_zone: input.placement_zone ?? "overview",
                context_config: input.context_config ?? { version: 1 },
                visibility_config: input.visibility_config ?? { version: 1, visible: true },
                sort_order: input.sort_order ?? 0,
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

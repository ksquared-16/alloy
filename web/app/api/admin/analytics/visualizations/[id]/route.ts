import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabaseAdmin";
import { requireAnalyticsV2AdminContext, requireAnalyticsV2AdminMutate, zodErrorResponse } from "@/lib/metrics/platform/adminApiHelpers";
import { validateMetricVisualizationUpdate } from "@/lib/metrics/platform/metricVisualizationSchema";

export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string }> };

export async function PATCH(request: NextRequest, context: RouteContext) {
    const gate = await requireAnalyticsV2AdminMutate();
    if (!gate.ok) return gate.response;

    const { id } = await context.params;
    const supabase = createAdminClient();

    const { data: existing, error: loadError } = await supabase
        .from("metric_visualizations")
        .select("*")
        .eq("id", id)
        .maybeSingle();

    if (loadError || !existing) {
        return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    if (existing.org_id == null) {
        return NextResponse.json(
            { error: "Global visualization templates are read-only. Create an org-owned copy to edit." },
            { status: 403 }
        );
    }
    if (existing.org_id !== gate.ctx.orgId) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    let body: unknown;
    try {
        body = await request.json();
    } catch {
        return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
    }

    try {
        const input = validateMetricVisualizationUpdate(body);
        const supabase = createAdminClient();
        const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
        for (const [k, v] of Object.entries(input)) {
            if (v !== undefined) updates[k] = v;
        }

        const { data, error } = await supabase
            .from("metric_visualizations")
            .update(updates)
            .eq("id", id)
            .eq("org_id", gate.ctx.orgId)
            .select("*")
            .single();

        if (error) return NextResponse.json({ error: error.message }, { status: 400 });
        return NextResponse.json({ item: data });
    } catch (e) {
        return zodErrorResponse(e);
    }
}

export async function GET(_request: NextRequest, context: RouteContext) {
    const gate = await requireAnalyticsV2AdminContext();
    if (!gate.ok) return gate.response;

    const { id } = await context.params;
    const supabase = createAdminClient();
    const { data, error } = await supabase
        .from("metric_visualizations")
        .select("*")
        .eq("id", id)
        .or(`org_id.eq.${gate.ctx.orgId},org_id.is.null`)
        .maybeSingle();

    if (error || !data) return NextResponse.json({ error: "Not found" }, { status: 404 });
    return NextResponse.json({ item: data });
}

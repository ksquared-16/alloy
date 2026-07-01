import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabaseAdmin";
import { requireAnalyticsV2AdminContext, requireAnalyticsV2AdminMutate, zodErrorResponse } from "@/lib/metrics/platform/adminApiHelpers";
import { validateMetricRollupUpdate } from "@/lib/metrics/platform/metricRollupSchema";

export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string }> };

export async function PATCH(request: NextRequest, context: RouteContext) {
    const gate = await requireAnalyticsV2AdminMutate();
    if (!gate.ok) return gate.response;

    const { id } = await context.params;
    let body: unknown;
    try {
        body = await request.json();
    } catch {
        return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
    }

    try {
        const input = validateMetricRollupUpdate(body);
        const supabase = createAdminClient();
        const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
        for (const [k, v] of Object.entries(input)) {
            if (v !== undefined) updates[k] = v;
        }

        const { data, error } = await supabase
            .from("metric_rollups")
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
        .from("metric_rollups")
        .select("*")
        .eq("id", id)
        .eq("org_id", gate.ctx.orgId)
        .maybeSingle();

    if (error || !data) return NextResponse.json({ error: "Not found" }, { status: 404 });
    return NextResponse.json({ item: data });
}

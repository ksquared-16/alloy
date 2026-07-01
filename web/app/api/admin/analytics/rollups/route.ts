import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabaseAdmin";
import { requireAnalyticsV2AdminContext, requireAnalyticsV2AdminMutate, zodErrorResponse } from "@/lib/metrics/platform/adminApiHelpers";
import { validateMetricRollupCreate } from "@/lib/metrics/platform/metricRollupSchema";

export const dynamic = "force-dynamic";

export async function GET() {
    const gate = await requireAnalyticsV2AdminContext();
    if (!gate.ok) return gate.response;

    const supabase = createAdminClient();
    const { data, error } = await supabase
        .from("metric_rollups")
        .select("*")
        .eq("org_id", gate.ctx.orgId)
        .order("key");

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ items: data ?? [] });
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
        const input = validateMetricRollupCreate(body);
        const supabase = createAdminClient();
        const { data, error } = await supabase
            .from("metric_rollups")
            .insert({
                org_id: gate.ctx.orgId,
                key: input.key,
                label: input.label,
                rollup_type: input.rollup_type,
                child_metric_config: input.child_metric_config,
                context_scope: input.context_scope ?? "org",
                weight_config: input.weight_config ?? null,
                threshold_config: input.threshold_config ?? null,
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

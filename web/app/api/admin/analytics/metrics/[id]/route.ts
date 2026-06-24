import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabaseAdmin";
import { requireAnalyticsV2AdminContext, requireAnalyticsV2AdminMutate, zodErrorResponse } from "@/lib/metrics/platform/adminApiHelpers";
import { validateMetricDefinitionUpdate } from "@/lib/metrics/platform/metricDefinitionSchema";
import { loadMetricDefinitionById } from "@/lib/metrics/platform/placementResolver";
import { validateSourceAggregation, validateSourceFilters, validateSourceDimensions } from "@/lib/metrics/platform/metricSourceRegistry";

export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(_request: NextRequest, context: RouteContext) {
    const gate = await requireAnalyticsV2AdminContext();
    if (!gate.ok) return gate.response;

    const { id } = await context.params;
    const supabase = createAdminClient();
    const item = await loadMetricDefinitionById(supabase, gate.ctx.orgId, id);
    if (!item) return NextResponse.json({ error: "Not found" }, { status: 404 });

    return NextResponse.json({ item });
}

export async function PATCH(request: NextRequest, context: RouteContext) {
    const gate = await requireAnalyticsV2AdminMutate();
    if (!gate.ok) return gate.response;

    const { id } = await context.params;
    const supabase = createAdminClient();
    const existing = await loadMetricDefinitionById(supabase, gate.ctx.orgId, id);
    if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });
    if (existing.org_id == null) {
        return NextResponse.json(
            { error: "Global metric templates are read-only. Create an org-owned metric to edit or publish." },
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
        const input = validateMetricDefinitionUpdate(body);
        const sourceKey = input.source_key ?? existing.source_key;
        const aggregation = input.aggregation ?? existing.aggregation;
        validateSourceAggregation(sourceKey, aggregation);
        if (input.filter_config?.filters) validateSourceFilters(sourceKey, input.filter_config.filters);
        if (input.dimension_config?.dimensions) validateSourceDimensions(sourceKey, input.dimension_config.dimensions);

        const updates: Record<string, unknown> = { updated_at: new Date().toISOString(), updated_by: gate.ctx.userId };
        for (const [k, v] of Object.entries(input)) {
            if (v !== undefined) updates[k] = v;
        }

        const { data, error } = await supabase
            .from("metric_definitions")
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

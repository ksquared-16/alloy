import { NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabaseAdmin";
import {
    requireAnalyticsV2AdminContext,
    requireAnalyticsV2AdminMutate,
    metricValidationError,
} from "@/lib/metrics/platform/adminApiHelpers";
import { validateMetricDefinitionUpdate } from "@/lib/metrics/platform/metricDefinitionSchema";
import { loadMetricDefinitionById } from "@/lib/metrics/platform/placementResolver";
import { validateSourceAggregation, validateSourceFilters, validateSourceDimensions } from "@/lib/metrics/platform/metricSourceRegistry";
import { apiOk, apiError } from "@/lib/api/apiResponse";

export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(request: NextRequest, context: RouteContext) {
    const gate = await requireAnalyticsV2AdminContext();
    if (!gate.ok) return gate.response;

    const { id } = await context.params;
    const supabase = createAdminClient();
    const item = await loadMetricDefinitionById(supabase, gate.ctx.orgId, id);
    if (!item) return apiError("NOT_FOUND", "Not found", 404, undefined, { request });

    return apiOk({ item }, { request });
}

export async function PATCH(request: NextRequest, context: RouteContext) {
    const gate = await requireAnalyticsV2AdminMutate();
    if (!gate.ok) return gate.response;

    const { id } = await context.params;
    const supabase = createAdminClient();
    const existing = await loadMetricDefinitionById(supabase, gate.ctx.orgId, id);
    if (!existing) return apiError("NOT_FOUND", "Not found", 404, undefined, { request });
    if (existing.org_id == null) {
        return apiError(
            "FORBIDDEN",
            "Global metric templates are read-only. Create an org-owned metric to edit or publish.",
            403,
            undefined,
            { request }
        );
    }
    if (existing.org_id !== gate.ctx.orgId) {
        return apiError("FORBIDDEN", "Forbidden", 403, undefined, { request });
    }

    let body: unknown;
    try {
        body = await request.json();
    } catch {
        return apiError("BAD_REQUEST", "Invalid JSON", 400, undefined, { request });
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

        if (error) return apiError("BAD_REQUEST", error.message, 400, undefined, { request });
        return apiOk({ item: data }, { request });
    } catch (e) {
        return metricValidationError(e, request);
    }
}

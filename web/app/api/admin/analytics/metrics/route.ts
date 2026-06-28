import { NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabaseAdmin";
import {
    requireAnalyticsV2AdminContext,
    requireAnalyticsV2AdminMutate,
    metricValidationError,
} from "@/lib/metrics/platform/adminApiHelpers";
import { validateMetricDefinitionCreate } from "@/lib/metrics/platform/metricDefinitionSchema";
import { validateSourceAggregation, validateSourceFilters, validateSourceDimensions } from "@/lib/metrics/platform/metricSourceRegistry";
import { loadMetricDefinitionsForOrg } from "@/lib/metrics/platform/placementResolver";
import { listMetricSourceAdapters } from "@/lib/metrics/platform/metricSourceRegistry";
import { apiOk, apiError } from "@/lib/api/apiResponse";

export const dynamic = "force-dynamic";

/**
 * Phase 2B contract (fully migrated): the metrics family emits the standard envelope.
 * - Success: `{ ok: true, data, correlation_id }`
 * - Failure: `{ ok: false, error: { code, message, details? }, correlation_id }`
 * Auth-gate responses (`gate.response`) remain owned by the shared analytics admin
 * gate. @see docs/api/api-response-contract.md
 */
export async function GET(request: NextRequest) {
    const gate = await requireAnalyticsV2AdminContext();
    if (!gate.ok) return gate.response;

    const supabase = createAdminClient();
    const items = await loadMetricDefinitionsForOrg(supabase, gate.ctx.orgId);
    const adapters = listMetricSourceAdapters();

    return apiOk({ items, adapters }, { request });
}

export async function POST(request: NextRequest) {
    const gate = await requireAnalyticsV2AdminMutate();
    if (!gate.ok) return gate.response;

    let body: unknown;
    try {
        body = await request.json();
    } catch {
        return apiError("BAD_REQUEST", "Invalid JSON", 400, undefined, { request });
    }

    try {
        const input = validateMetricDefinitionCreate(body);
        validateSourceAggregation(input.source_key, input.aggregation);
        if (input.filter_config?.filters) {
            validateSourceFilters(input.source_key, input.filter_config.filters);
        }
        if (input.dimension_config?.dimensions) {
            validateSourceDimensions(input.source_key, input.dimension_config.dimensions);
        }

        const supabase = createAdminClient();
        const { data, error } = await supabase
            .from("metric_definitions")
            .insert({
                org_id: gate.ctx.orgId,
                key: input.key,
                label: input.label,
                description: input.description ?? "",
                category: input.category ?? "general",
                entity_scope: input.entity_scope ?? "org",
                source_type: input.source_type,
                source_key: input.source_key,
                aggregation: input.aggregation,
                numerator_config: input.numerator_config ?? null,
                denominator_config: input.denominator_config ?? null,
                filter_config: input.filter_config ?? { version: 1 },
                dimension_config: input.dimension_config ?? { version: 1 },
                default_period_config: input.default_period_config ?? { version: 1, kind: "rolling", days: 30 },
                unit: input.unit ?? "none",
                precision: input.precision ?? 0,
                is_kpi: input.is_kpi ?? false,
                target_config: input.target_config ?? null,
                threshold_config: input.threshold_config ?? null,
                status: input.status ?? "draft",
                version: 1,
                created_by: gate.ctx.userId,
                updated_by: gate.ctx.userId,
            })
            .select("*")
            .single();

        if (error) return apiError("BAD_REQUEST", error.message, 400, undefined, { request });
        return apiOk({ item: data }, { request, status: 201 });
    } catch (e) {
        return metricValidationError(e, request);
    }
}

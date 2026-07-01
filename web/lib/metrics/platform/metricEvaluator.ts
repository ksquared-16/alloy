import type { SupabaseClient } from "@supabase/supabase-js";
import type {
    MetricDefinitionRow,
    MetricEvaluationContext,
    MetricEvaluationResult,
} from "@/lib/metrics/platform/types";
import { resolveMetricPeriodBounds, metricPeriodToWindowKey } from "@/lib/metrics/platform/metricPeriod";
import { evaluatePlatformMetricHealth } from "@/lib/metrics/platform/metricHealth";
import { formatPlatformMetricValue } from "@/lib/metrics/platform/metricFormatters";
import { resolveOipMetricKeyFromSource, validateSourceAggregation } from "@/lib/metrics/platform/metricSourceRegistry";
import { resolveSingleMetric } from "@/lib/metrics/metricEngine";
import type { MetricDimensions } from "@/lib/metrics/types";
import type { AdminAccessScopeDimensions } from "@/lib/admin/accessScope";

export type EvaluateMetricParams = {
    supabase: SupabaseClient;
    definition: MetricDefinitionRow;
    ctx: MetricEvaluationContext;
    accessScope?: AdminAccessScopeDimensions;
    orgMetadata?: unknown;
};

function buildMetricDimensions(definition: MetricDefinitionRow, ctx: MetricEvaluationContext): MetricDimensions {
    const dims: MetricDimensions = {};
    const configured = definition.dimension_config?.dimensions ?? {};
    const runtime = ctx.dimensions ?? {};
    for (const [k, v] of Object.entries({ ...configured, ...runtime })) {
        if (k === "lifecycle_stage") dims.lifecycle_stage = v;
        if (k === "status_key") dims.status_key = v;
    }
    return dims;
}

/** Server-side metric evaluator — delegates to code-owned OIP adapters. No client-side trusted computation. */
export async function evaluateMetricDefinition(params: EvaluateMetricParams): Promise<MetricEvaluationResult> {
    const { supabase, definition, ctx, accessScope, orgMetadata } = params;

    validateSourceAggregation(definition.source_key, definition.aggregation);

    const oipKey = resolveOipMetricKeyFromSource(definition.source_key);
    if (!oipKey) {
        throw new Error(`Source ${definition.source_key} is not available for evaluation`);
    }

    const period = ctx.period ?? definition.default_period_config;
    const bounds = resolveMetricPeriodBounds(period, ctx.now ?? new Date());
    const window = metricPeriodToWindowKey(period);

    const siteLocationId =
        (ctx.siteLocationId as string | null | undefined) ??
        (definition.filter_config?.filters?.site_id as string | undefined) ??
        null;

    const workUnitId =
        ctx.workUnitId ??
        (definition.filter_config?.filters?.work_unit_id as string | undefined) ??
        null;

    const scope = accessScope ?? {
        departmentScope: "all",
        allowedDepartmentIds: null,
        siteScope: "all",
        allowedSiteLocationIds: null,
    };

    const resolved = await resolveSingleMetric(
        {
            supabase,
            orgId: ctx.orgId,
            scope,
            window,
            siteLocationId,
            workUnitId,
            dimensions: buildMetricDimensions(definition, ctx),
            now: ctx.now,
            mode: "live",
        },
        oipKey
    );

    const meta = resolved.meta ?? {};
    const numeratorValue =
        typeof meta.numerator === "number"
            ? meta.numerator
            : typeof meta.completed === "number"
              ? meta.completed
              : null;
    const denominatorValue =
        typeof meta.denominator === "number"
            ? meta.denominator
            : typeof meta.scheduled === "number"
              ? meta.scheduled
              : null;

    const healthState = definition.is_kpi
        ? evaluatePlatformMetricHealth({
              value: resolved.value,
              target: definition.target_config,
              thresholds: definition.threshold_config,
          })
        : "unknown";

    return {
        metricDefinitionId: definition.id,
        key: definition.key,
        label: definition.label,
        unit: definition.unit,
        value: resolved.value,
        numeratorValue,
        denominatorValue,
        formattedValue: formatPlatformMetricValue(definition.unit, resolved.value, definition.precision),
        healthState,
        periodStart: bounds.periodStart.toISOString(),
        periodEnd: bounds.periodEnd.toISOString(),
        computedAt: resolved.computedAtIso,
        meta: { ...meta, oip_metric_key: oipKey, org_metadata_used: orgMetadata != null },
    };
}

export async function evaluateMetricDefinitionsBatch(params: {
    supabase: SupabaseClient;
    definitions: MetricDefinitionRow[];
    ctx: MetricEvaluationContext;
    accessScope?: AdminAccessScopeDimensions;
    orgMetadata?: unknown;
}): Promise<MetricEvaluationResult[]> {
    const results: MetricEvaluationResult[] = [];
    for (const definition of params.definitions) {
        if (definition.status !== "active") continue;
        try {
            results.push(
                await evaluateMetricDefinition({
                    supabase: params.supabase,
                    definition,
                    ctx: params.ctx,
                    accessScope: params.accessScope,
                    orgMetadata: params.orgMetadata,
                })
            );
        } catch {
            results.push({
                metricDefinitionId: definition.id,
                key: definition.key,
                label: definition.label,
                unit: definition.unit,
                value: null,
                numeratorValue: null,
                denominatorValue: null,
                formattedValue: "—",
                healthState: "unknown",
                periodStart: new Date().toISOString(),
                periodEnd: new Date().toISOString(),
                computedAt: new Date().toISOString(),
                meta: { error: "evaluation_failed" },
            });
        }
    }
    return results;
}

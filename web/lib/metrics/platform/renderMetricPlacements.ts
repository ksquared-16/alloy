import type { SupabaseClient } from "@supabase/supabase-js";
import type {
    MetricHealthState,
    MetricPlatformSnapshotRow,
    MetricSurface,
    MetricTrendComparison,
    ResolvedMetricPlacement,
} from "@/lib/metrics/platform/types";
import { resolvePlacementsForSurface } from "@/lib/metrics/platform/placementResolver";
import {
    getLatestMetricPlatformSnapshot,
    getMetricPlatformSnapshotSeries,
} from "@/lib/metrics/platform/metricSnapshots";
import { comparePeriodOverPeriod, buildSparklinePoints } from "@/lib/metrics/platform/metricTrends";
import { formatPlatformMetricValue } from "@/lib/metrics/platform/metricFormatters";

export type MetricPlacementRenderItem = ResolvedMetricPlacement & {
    formattedValue: string;
    healthState: MetricHealthState;
    snapshot: MetricPlatformSnapshotRow | null;
    sparklinePoints: number[];
    comparison: MetricTrendComparison | null;
    periodStart: string | null;
    periodEnd: string | null;
};

export type RenderMetricPlacementsParams = {
    supabase: SupabaseClient;
    orgId: string;
    surface: MetricSurface;
    surfaceKey?: string;
    placementZone?: string;
    contextType?: string;
    contextId?: string | null;
};

export async function renderMetricPlacementsForSurface(
    params: RenderMetricPlacementsParams
): Promise<MetricPlacementRenderItem[]> {
    const placements = await resolvePlacementsForSurface({
        supabase: params.supabase,
        orgId: params.orgId,
        surface: params.surface,
        surfaceKey: params.surfaceKey ?? "default",
        placementZone: params.placementZone,
    });

    const contextType = params.contextType ?? "org";
    const contextId = params.contextId ?? null;

    const items: MetricPlacementRenderItem[] = [];

    for (const placement of placements) {
        const defId = placement.definition.id;
        const snapshot = await getLatestMetricPlatformSnapshot(params.supabase, {
            orgId: params.orgId,
            metricDefinitionId: defId,
            contextType,
            contextId,
        });

        const series = await getMetricPlatformSnapshotSeries(params.supabase, {
            orgId: params.orgId,
            metricDefinitionId: defId,
            contextType,
            contextId,
            limit: 30,
        });

        const sparklinePoints = buildSparklinePoints(series);
        const comparison =
            series.length >= 2
                ? comparePeriodOverPeriod({
                      current: series[series.length - 1]!,
                      previous: series[series.length - 2]!,
                      target: placement.definition.target_config,
                  })
                : null;

        const value = snapshot?.value ?? null;
        const healthState = (snapshot?.health_state ?? "unknown") as MetricHealthState;

        items.push({
            ...placement,
            formattedValue: formatPlatformMetricValue(
                placement.definition.unit,
                value,
                placement.definition.precision
            ),
            healthState,
            snapshot,
            sparklinePoints,
            comparison,
            periodStart: snapshot?.period_start ?? null,
            periodEnd: snapshot?.period_end ?? null,
        });
    }

    return items;
}

export async function renderMetricPlacementsByZone(
    params: RenderMetricPlacementsParams & { zones: readonly string[] }
): Promise<Record<string, MetricPlacementRenderItem[]>> {
    const result: Record<string, MetricPlacementRenderItem[]> = {};
    for (const zone of params.zones) {
        result[zone] = await renderMetricPlacementsForSurface({ ...params, placementZone: zone });
    }
    return result;
}

export function placementRenderToEvaluation(item: MetricPlacementRenderItem) {
    return {
        metricDefinitionId: item.definition.id,
        key: item.definition.key,
        label: item.definition.label,
        unit: item.definition.unit,
        value: item.snapshot?.value ?? null,
        numeratorValue: item.snapshot?.numerator_value ?? null,
        denominatorValue: item.snapshot?.denominator_value ?? null,
        formattedValue: item.formattedValue,
        healthState: item.healthState,
        periodStart: item.periodStart ?? new Date().toISOString(),
        periodEnd: item.periodEnd ?? new Date().toISOString(),
        computedAt: item.snapshot?.computed_at ?? new Date().toISOString(),
    };
}

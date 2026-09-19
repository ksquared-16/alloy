import { getMetricSourceMetadata } from "@/lib/metrics/registry";
import type { MetricDimensions, MetricResolveResult, OipMetricKey } from "@/lib/metrics/types";
import type { MetricResolveApiItem } from "@/app/api/admin/metrics/resolve/route";

/**
 * ONE SERIALISATION OF A RESOLVED METRIC.
 *
 * The engine answers in camelCase; the wire contract the header reads is snake_case, and the KPI
 * evaluation is flattened into it. That mapping used to live inline in the metrics route, which was
 * fine while the route was the only producer. The document now resolves the same header KPIs during
 * its own composition, and a second hand-written mapping there would be a second definition of the
 * wire shape — free to drift a field at a time, invisibly, because both sides would still typecheck.
 *
 * So the mapping lives here and both callers use it. This is a move, not a rewrite: the route's
 * behaviour is unchanged.
 */
export function metricResolveApiItemsFromResolved(
    resolved: readonly MetricResolveResult[],
    dimensions: MetricDimensions = {},
): MetricResolveApiItem[] {
    return resolved.map((row) => {
        const m = row.metric;
        const item: MetricResolveApiItem = {
            metric_key: m.key,
            label: m.label,
            format: m.format,
            value: m.value,
            formatted_value: m.formattedValue,
            window: m.window,
            window_start: m.windowStartIso,
            window_end: m.windowEndIso,
            computed_at: m.computedAtIso,
            resolve_mode: m.resolveMode,
            sources: m.sources,
            source_metadata: getMetricSourceMetadata(m.key as OipMetricKey),
            ...(Object.keys(dimensions).length ? { dimensions } : {}),
            ...(m.meta ? { meta: m.meta } : {}),
        };

        if (row.kpi) {
            item.kpi = {
                kpi_key: row.kpi.key,
                label: row.kpi.label,
                status: row.kpi.status,
                target_kind: row.kpi.targetKind,
                target_max_hours: row.kpi.targetMaxHours,
                target_min_rate: row.kpi.targetMinRate,
                target_max_count: row.kpi.targetMaxCount,
                thresholds: {
                    healthy_max_hours: row.kpi.thresholds.healthyMaxHours,
                    warning_max_hours: row.kpi.thresholds.warningMaxHours,
                    healthy_min_rate: row.kpi.thresholds.healthyMinRate,
                    warning_min_rate: row.kpi.thresholds.warningMinRate,
                    healthy_max_count: row.kpi.thresholds.healthyMaxCount,
                    warning_max_count: row.kpi.thresholds.warningMaxCount,
                },
                observed_value_hours: row.kpi.observedValueHours,
                observed_value_rate: row.kpi.observedValueRate,
                observed_value_count: row.kpi.observedValueCount,
            };
        }
        return item;
    });
}

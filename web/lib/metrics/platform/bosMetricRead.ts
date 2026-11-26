import type { SupabaseClient } from "@supabase/supabase-js";
import type { BosMetricSummary, MetricDefinitionRow } from "@/lib/metrics/platform/types";
import { loadMetricDefinitionsForOrg } from "@/lib/metrics/platform/placementResolver";
import { evaluateMetricDefinition } from "@/lib/metrics/platform/metricEvaluator";
import { getLatestMetricPlatformSnapshot, getMetricPlatformSnapshotSeries } from "@/lib/metrics/platform/metricSnapshots";
import { comparePeriodOverPeriod } from "@/lib/metrics/platform/metricTrends";
import { formatPlatformMetricValue } from "@/lib/metrics/platform/metricFormatters";
import { computeMetricRollup } from "@/lib/metrics/platform/metricRollups";
import type { MetricRollupRow } from "@/lib/metrics/platform/types";
import type { AdminAccessScopeDimensions } from "@/lib/admin/accessScope";
import { snapshotReadableForScope } from "@/lib/metrics/metricScopeGuard";

/** BOS-safe metric read — governed definitions and snapshots only, no raw queries. */
export async function listBosReadableMetrics(
    supabase: SupabaseClient,
    orgId: string
): Promise<{ key: string; label: string; description: string; isKpi: boolean }[]> {
    const defs = await loadMetricDefinitionsForOrg(supabase, orgId, "active");
    return defs.map((d) => ({
        key: d.key,
        label: d.label,
        description: d.description,
        isKpi: d.is_kpi,
    }));
}

/**
 * WS0-A — every BOS read names the caller's access scope. These read ORG-context platform
 * snapshots, which only an unrestricted caller may see; a restricted caller is evaluated live with
 * its own scope instead. (They previously read the latest snapshot of ANY context and evaluated
 * with an implied unrestricted scope.)
 */
export async function getBosMetricValue(
    supabase: SupabaseClient,
    orgId: string,
    metricKey: string,
    accessScope: AdminAccessScopeDimensions
): Promise<BosMetricSummary | null> {
    const defs = await loadMetricDefinitionsForOrg(supabase, orgId, "active");
    const def = defs.find((d) => d.key === metricKey);
    if (!def) return null;

    const snapshot = snapshotReadableForScope(accessScope, "org", null)
        ? await getLatestMetricPlatformSnapshot(supabase, {
              orgId,
              metricDefinitionId: def.id,
              contextType: "org",
              contextId: null,
          })
        : null;

    if (snapshot) {
        return {
            key: def.key,
            label: def.label,
            value: snapshot.value,
            formattedValue: formatPlatformMetricValue(def.unit, snapshot.value, def.precision),
            healthState: snapshot.health_state,
            unit: def.unit,
            periodStart: snapshot.period_start,
            periodEnd: snapshot.period_end,
        };
    }

    try {
        const evaluation = await evaluateMetricDefinition({
            supabase,
            definition: def,
            ctx: { orgId },
            accessScope,
        });
        return {
            key: def.key,
            label: def.label,
            value: evaluation.value,
            formattedValue: evaluation.formattedValue,
            healthState: evaluation.healthState,
            unit: def.unit,
            periodStart: evaluation.periodStart,
            periodEnd: evaluation.periodEnd,
        };
    } catch {
        return null;
    }
}

export async function getBosMetricTrend(
    supabase: SupabaseClient,
    orgId: string,
    metricKey: string,
    accessScope: AdminAccessScopeDimensions
): Promise<{
    key: string;
    label: string;
    series: { computedAt: string; value: number | null }[];
    comparison: ReturnType<typeof comparePeriodOverPeriod> | null;
} | null> {
    const defs = await loadMetricDefinitionsForOrg(supabase, orgId, "active");
    const def = defs.find((d) => d.key === metricKey);
    if (!def) return null;

    const series = snapshotReadableForScope(accessScope, "org", null)
        ? await getMetricPlatformSnapshotSeries(supabase, {
              orgId,
              metricDefinitionId: def.id,
              contextType: "org",
              contextId: null,
              limit: 30,
          })
        : [];

    const comparison =
        series.length >= 2
            ? comparePeriodOverPeriod({
                  current: series[series.length - 1]!,
                  previous: series[series.length - 2]!,
                  target: def.target_config,
              })
            : null;

    return {
        key: def.key,
        label: def.label,
        series: series.map((s) => ({ computedAt: s.computed_at, value: s.value })),
        comparison,
    };
}

export async function getBosMetricRollupSummary(
    supabase: SupabaseClient,
    orgId: string,
    rollupKey: string,
    accessScope: AdminAccessScopeDimensions
): Promise<{ key: string; label: string; value: number | null; healthState: string } | null> {
    const { data } = await supabase
        .from("metric_rollups")
        .select("*")
        .eq("org_id", orgId)
        .eq("key", rollupKey)
        .eq("status", "active")
        .maybeSingle();

    if (!data) return null;

    const result = await computeMetricRollup({
        supabase,
        rollup: data as MetricRollupRow,
        ctx: { orgId },
        accessScope,
    });

    return {
        key: result.key,
        label: result.label,
        value: result.value,
        healthState: result.healthState,
    };
}

export function bosMetricDefinitionSummary(def: MetricDefinitionRow): string {
    return `${def.label} (${def.key}): ${def.description}`;
}

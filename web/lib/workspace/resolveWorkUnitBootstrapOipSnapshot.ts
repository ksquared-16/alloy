import type { SupabaseClient } from "@supabase/supabase-js";
import type { MetricResolveApiItem } from "@/app/api/admin/metrics/resolve/route";
import { OPERATIONAL_PULSE_METRIC_KEYS } from "@/lib/kpi/workspaceKpiPresentation";
import { getMetricDefinition, getMetricSourceMetadata } from "@/lib/metrics/registry";
import { evaluateKpiForMetric } from "@/lib/metrics/kpiEvaluator";
import { kpiForMetric } from "@/lib/metrics/kpiRegistry";
import { formatMetricValue } from "@/lib/metrics/formatMetricValue";
import { readLatestMetricSnapshot } from "@/lib/metrics/snapshots/readMetricSnapshot";
import type { ResolvedMetricValue } from "@/lib/metrics/types";
import type { OipMetricKey } from "@/lib/metrics/types";

export type WorkUnitBootstrapOipSnapshot = {
    metrics: MetricResolveApiItem[];
    keys: OipMetricKey[];
    /** snapshot rows found vs stable no-data fallbacks */
    source: "snapshot" | "no_data" | "mixed";
};

function stableNoDataMetric(key: OipMetricKey): ResolvedMetricValue {
    const def = getMetricDefinition(key);
    const nowIso = new Date().toISOString();
    return {
        key,
        label: def.label,
        format: def.format,
        value: null,
        formattedValue: "—",
        window: "rolling_30d",
        windowStartIso: nowIso,
        windowEndIso: nowIso,
        computedAtIso: nowIso,
        sources: def.sources,
        resolveMode: "snapshot",
    };
}

function metricToApiItem(
    metric: ResolvedMetricValue,
    orgMetadata: unknown
): MetricResolveApiItem {
    const item: MetricResolveApiItem = {
        metric_key: metric.key,
        label: metric.label,
        format: metric.format,
        value: metric.value,
        formatted_value: metric.formattedValue,
        window: metric.window,
        window_start: metric.windowStartIso,
        window_end: metric.windowEndIso,
        computed_at: metric.computedAtIso,
        resolve_mode: metric.resolveMode,
        sources: metric.sources,
        source_metadata: getMetricSourceMetadata(metric.key as OipMetricKey),
        ...(metric.meta ? { meta: metric.meta } : {}),
    };
    const kpiKey = kpiForMetric(metric.key as OipMetricKey);
    if (kpiKey) {
        const kpi = evaluateKpiForMetric({ kpiKey, metric, orgMetadata });
        item.kpi = {
            kpi_key: kpi.key,
            label: kpi.label,
            status: kpi.status,
            target_kind: kpi.targetKind,
            target_max_hours: kpi.targetMaxHours,
            target_min_rate: kpi.targetMinRate,
            target_max_count: kpi.targetMaxCount,
            thresholds: {
                healthy_max_hours: kpi.thresholds.healthyMaxHours,
                warning_max_hours: kpi.thresholds.warningMaxHours,
                healthy_min_rate: kpi.thresholds.healthyMinRate,
                warning_min_rate: kpi.thresholds.warningMinRate,
                healthy_max_count: kpi.thresholds.healthyMaxCount,
                warning_max_count: kpi.thresholds.warningMaxCount,
            },
            observed_value_hours: kpi.observedValueHours,
            observed_value_rate: kpi.observedValueRate,
            observed_value_count: kpi.observedValueCount,
        };
    }
    return item;
}

async function readSnapshotMetric(
    supabase: SupabaseClient,
    params: {
        orgId: string;
        siteLocationId: string | null;
        workUnitId: string;
        key: OipMetricKey;
    }
): Promise<ResolvedMetricValue | null> {
    const def = getMetricDefinition(params.key);
    const scopeType = params.workUnitId ? ("work_unit" as const) : params.siteLocationId ? ("site" as const) : ("org" as const);
    const scopeId = params.workUnitId || params.siteLocationId || null;

    const row = await readLatestMetricSnapshot(supabase, {
        orgId: params.orgId,
        metricKey: params.key,
        windowKey: "rolling_30d",
        scopeType,
        scopeId,
    });
    if (!row) return null;

    const value = row.value_numeric;
    return {
        key: params.key,
        label: def.label,
        format: def.format,
        value,
        formattedValue: formatMetricValue(def.format, value),
        window: "rolling_30d",
        windowStartIso: row.computed_at,
        windowEndIso: row.computed_at,
        computedAtIso: row.computed_at,
        sources: def.sources,
        resolveMode: "snapshot",
        meta: { ...(row.value_json ?? {}), snapshot_id: row.id },
    };
}

/**
 * Bootstrap above-fold OIP — snapshot reads only (no live MetricEngine on critical path).
 * Missing snapshots return stable "—" values so atomic reveal never waits on client fetch.
 */
export async function resolveWorkUnitBootstrapOipSnapshot(params: {
    supabase: SupabaseClient;
    orgId: string;
    siteLocationId: string | null;
    workUnitId: string;
    orgMetadata?: unknown;
    keys?: readonly OipMetricKey[];
}): Promise<WorkUnitBootstrapOipSnapshot> {
    const keys = [...(params.keys ?? OPERATIONAL_PULSE_METRIC_KEYS)];
    const orgMetadata = params.orgMetadata ?? null;

    const resolved = await Promise.all(
        keys.map(async (key) => {
            const snap = await readSnapshotMetric(params.supabase, {
                orgId: params.orgId,
                siteLocationId: params.siteLocationId,
                workUnitId: params.workUnitId,
                key,
            });
            return snap ?? stableNoDataMetric(key);
        })
    );

    let snapshotHits = 0;
    for (const m of resolved) {
        if (m.meta?.snapshot_id) snapshotHits += 1;
    }

    const metrics = resolved.map((m) => metricToApiItem(m, orgMetadata));
    const source: WorkUnitBootstrapOipSnapshot["source"] =
        snapshotHits === 0 ? "no_data" : snapshotHits === keys.length ? "snapshot" : "mixed";

    return { metrics, keys, source };
}

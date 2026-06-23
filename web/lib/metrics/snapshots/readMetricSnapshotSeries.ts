import type { SupabaseClient } from "@supabase/supabase-js";
import type { MetricSnapshotReadQuery, MetricSnapshotRow } from "@/lib/metrics/snapshots/types";

const DEFAULT_SERIES_LIMIT = 8;
const DEFAULT_LOOKBACK_MS = 90 * 24 * 60 * 60 * 1000;

export type MetricSnapshotSeriesQuery = MetricSnapshotReadQuery & {
    limit?: number;
    lookbackMs?: number;
};

/** Read recent snapshot rows for trend/sparkline (newest first). */
export async function readMetricSnapshotSeries(
    supabase: SupabaseClient,
    query: MetricSnapshotSeriesQuery
): Promise<MetricSnapshotRow[]> {
    const limit = query.limit ?? DEFAULT_SERIES_LIMIT;
    const lookbackMs = query.lookbackMs ?? DEFAULT_LOOKBACK_MS;
    const minComputedAt = new Date(Date.now() - lookbackMs).toISOString();

    let q = supabase
        .from("metric_snapshots")
        .select("*")
        .eq("org_id", query.orgId)
        .eq("metric_key", query.metricKey)
        .eq("window_key", query.windowKey)
        .eq("scope_type", query.scopeType ?? "org")
        .gte("computed_at", minComputedAt)
        .order("computed_at", { ascending: false })
        .limit(limit);

    if (query.scopeId) {
        q = q.eq("scope_id", query.scopeId);
    } else {
        q = q.is("scope_id", null);
    }

    if (query.dimensionKey && query.dimensionValue) {
        q = q.eq("dimension_key", query.dimensionKey).eq("dimension_value", query.dimensionValue);
    } else {
        q = q.is("dimension_key", null).is("dimension_value", null);
    }

    const { data, error } = await q;
    if (error) {
        console.warn("[readMetricSnapshotSeries]", error.message);
        return [];
    }
    return (data as MetricSnapshotRow[]) ?? [];
}

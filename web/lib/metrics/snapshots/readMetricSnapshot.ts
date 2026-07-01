import type { SupabaseClient } from "@supabase/supabase-js";
import type { MetricSnapshotReadQuery, MetricSnapshotRow } from "@/lib/metrics/snapshots/types";

const DEFAULT_MAX_AGE_MS = 24 * 60 * 60 * 1000;

/** Read the newest matching snapshot if fresh enough; otherwise null. */
export async function readLatestMetricSnapshot(
    supabase: SupabaseClient,
    query: MetricSnapshotReadQuery
): Promise<MetricSnapshotRow | null> {
    const maxAgeMs = query.maxAgeMs ?? DEFAULT_MAX_AGE_MS;
    const minComputedAt = new Date(Date.now() - maxAgeMs).toISOString();

    let q = supabase
        .from("metric_snapshots")
        .select("*")
        .eq("org_id", query.orgId)
        .eq("metric_key", query.metricKey)
        .eq("window_key", query.windowKey)
        .eq("scope_type", query.scopeType ?? "org")
        .gte("computed_at", minComputedAt)
        .order("computed_at", { ascending: false })
        .limit(1);

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

    const { data, error } = await q.maybeSingle();
    if (error) {
        console.warn("[readLatestMetricSnapshot]", error.message);
        return null;
    }
    return (data as MetricSnapshotRow | null) ?? null;
}

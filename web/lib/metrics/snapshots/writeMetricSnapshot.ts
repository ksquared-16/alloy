import type { SupabaseClient } from "@supabase/supabase-js";
import type { MetricSnapshotWriteInput } from "@/lib/metrics/snapshots/types";

/** Insert one metric snapshot row (append-only). */
export async function writeMetricSnapshot(
    supabase: SupabaseClient,
    input: MetricSnapshotWriteInput
): Promise<{ id: string | null; error: string | null }> {
    const { data, error } = await supabase
        .from("metric_snapshots")
        .insert({
            org_id: input.orgId,
            metric_key: input.metricKey,
            window_key: input.windowKey,
            scope_type: input.scopeType ?? "org",
            scope_id: input.scopeId ?? null,
            dimension_key: input.dimensionKey ?? null,
            dimension_value: input.dimensionValue ?? null,
            value_numeric: input.valueNumeric,
            value_json: input.valueJson ?? {},
            computed_at: input.computedAt,
        })
        .select("id")
        .single();

    if (error) return { id: null, error: error.message };
    return { id: (data as { id: string }).id, error: null };
}

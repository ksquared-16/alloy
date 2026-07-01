import type { SupabaseClient } from "@supabase/supabase-js";
import { getMetricDefinition } from "@/lib/metrics/registry";
import type { MetricTimeWindowKey, OipMetricKey } from "@/lib/metrics/types";
import type { MetricSnapshotScopeType } from "@/lib/metrics/snapshots/types";
import {
    computeMetricTrendFromSnapshots,
    type MetricTrendSummary,
} from "@/lib/metrics/snapshots/computeMetricTrend";
import { readMetricSnapshotSeries } from "@/lib/metrics/snapshots/readMetricSnapshotSeries";

export type MetricTrendReadQuery = {
    orgId: string;
    metricKey: OipMetricKey;
    windowKey: MetricTimeWindowKey;
    scopeType?: MetricSnapshotScopeType;
    scopeId?: string | null;
    seriesLimit?: number;
};

export async function readMetricTrend(
    supabase: SupabaseClient,
    query: MetricTrendReadQuery
): Promise<MetricTrendSummary> {
    const def = getMetricDefinition(query.metricKey);
    const rows = await readMetricSnapshotSeries(supabase, {
        orgId: query.orgId,
        metricKey: query.metricKey,
        windowKey: query.windowKey,
        scopeType: query.scopeType ?? "org",
        scopeId: query.scopeId ?? null,
        limit: query.seriesLimit,
    });
    return computeMetricTrendFromSnapshots(rows, def.format);
}

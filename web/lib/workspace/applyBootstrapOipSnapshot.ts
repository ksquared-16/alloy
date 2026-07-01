import type { MetricResolveApiItem } from "@/app/api/admin/metrics/resolve/route";
import type { OipMetricStripValues } from "@/lib/kpi/oipBridge";
import type { ResolvedMetricMap } from "@/lib/metrics/fetchResolvedMetrics";
import type { OipMetricKey } from "@/lib/metrics/types";

/** Apply bootstrap OIP snapshot to client KPI state — atomic reveal, no post-paint fetch required. */
export function bootstrapOipSnapshotToClientState(metrics: MetricResolveApiItem[]): {
    resolved: ResolvedMetricMap;
    stripValues: OipMetricStripValues;
} {
    const resolved: ResolvedMetricMap = {};
    const stripValues = {} as OipMetricStripValues;
    for (const m of metrics) {
        const key = m.metric_key as OipMetricKey;
        resolved[key] = m;
        if (m.formatted_value) {
            stripValues[key] = m.formatted_value;
        }
    }
    return { resolved, stripValues };
}

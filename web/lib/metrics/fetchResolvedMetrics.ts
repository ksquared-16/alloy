import type { MetricTimeWindowKey, OipMetricKey } from "@/lib/metrics/types";
import type { MetricResolveApiItem } from "@/app/api/admin/metrics/resolve/route";

export type ResolvedMetricMap = Partial<Record<OipMetricKey, MetricResolveApiItem>>;

export type FetchResolvedMetricsParams = {
    keys: OipMetricKey[];
    window?: MetricTimeWindowKey;
    siteId?: string | null;
    workUnitId?: string | null;
    mode?: "live" | "snapshot";
};

/** Client fetch — all values computed server-side via MetricEngine. */
export async function fetchResolvedMetrics(
    params: FetchResolvedMetricsParams
): Promise<ResolvedMetricMap> {
    const out: ResolvedMetricMap = {};
    if (!params.keys.length) return out;

    const qs = new URLSearchParams();
    qs.set("keys", params.keys.join(","));
    if (params.window) qs.set("window", params.window);
    if (params.siteId) qs.set("site_id", params.siteId);
    if (params.workUnitId) qs.set("work_unit_id", params.workUnitId);
    if (params.mode) qs.set("mode", params.mode);

    const res = await fetch(`/api/admin/metrics/resolve?${qs.toString()}`, { credentials: "include" });
    if (!res.ok) return out;

    const body = (await res.json()) as { metrics?: MetricResolveApiItem[] };
    for (const m of body.metrics ?? []) {
        if (params.keys.includes(m.metric_key as OipMetricKey)) {
            out[m.metric_key as OipMetricKey] = m;
        }
    }
    return out;
}

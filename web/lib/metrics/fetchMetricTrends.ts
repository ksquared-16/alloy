import type { MetricTimeWindowKey, OipMetricKey } from "@/lib/metrics/types";
import type { MetricTrendApiItem } from "@/app/api/admin/metrics/trends/route";

export type MetricTrendMap = Partial<Record<OipMetricKey, MetricTrendApiItem>>;

export async function fetchMetricTrends(params: {
    keys: OipMetricKey[];
    window?: MetricTimeWindowKey;
    siteId?: string | null;
    points?: number;
}): Promise<MetricTrendMap> {
    const out: MetricTrendMap = {};
    if (!params.keys.length) return out;

    const qs = new URLSearchParams();
    qs.set("keys", params.keys.join(","));
    if (params.window) qs.set("window", params.window);
    if (params.siteId) qs.set("site_id", params.siteId);
    if (params.points) qs.set("points", String(params.points));

    const res = await fetch(`/api/admin/metrics/trends?${qs.toString()}`, { credentials: "include" });
    if (!res.ok) return out;

    const body = (await res.json()) as { trends?: MetricTrendApiItem[] };
    for (const t of body.trends ?? []) {
        if (params.keys.includes(t.metric_key as OipMetricKey)) {
            out[t.metric_key as OipMetricKey] = t;
        }
    }
    return out;
}

import type { MetricKey, WorkspaceKpiPlacementRow } from "@/lib/kpi/types";
import type { OipMetricKey } from "@/lib/metrics/types";

/** Workspace strip key → OIP MetricEngine key. */
export const OIP_STRIP_KEY_TO_METRIC: Record<string, OipMetricKey> = {
    "oip.enrollment.tour_conversion_rate": "enrollment.tour_conversion_rate",
    "oip.enrollment.time_to_schedule_tour": "enrollment.time_to_schedule_tour",
    "oip.ops.work_overdue_count": "ops.work_overdue_count",
};

export function isOipStripMetricKey(key: string): key is MetricKey {
    return key.startsWith("oip.") && key in OIP_STRIP_KEY_TO_METRIC;
}

export function oipMetricKeyForStripKey(stripKey: string): OipMetricKey | null {
    return OIP_STRIP_KEY_TO_METRIC[stripKey] ?? null;
}

export function extractOipMetricKeysFromPlacements(rows: WorkspaceKpiPlacementRow[]): OipMetricKey[] {
    const out: OipMetricKey[] = [];
    for (const row of rows) {
        if (row.is_visible === false) continue;
        const mk = oipMetricKeyForStripKey(row.metric_key);
        if (mk && !out.includes(mk)) out.push(mk);
    }
    return out;
}

export type OipMetricStripValues = Record<OipMetricKey, string>;

/** Client fetch — values computed server-side only. */
export async function fetchOipMetricStripValues(params: {
    keys: OipMetricKey[];
    siteId?: string | null;
    window?: string;
}): Promise<OipMetricStripValues> {
    const out = {} as OipMetricStripValues;
    if (!params.keys.length) return out;

    const qs = new URLSearchParams();
    qs.set("keys", params.keys.join(","));
    if (params.window) qs.set("window", params.window);
    if (params.siteId) qs.set("site_id", params.siteId);

    const res = await fetch(`/api/admin/metrics/resolve?${qs.toString()}`, { credentials: "include" });
    if (!res.ok) return out;

    const body = (await res.json()) as {
        metrics?: Array<{ metric_key: string; formatted_value: string }>;
    };
    for (const m of body.metrics ?? []) {
        if (params.keys.includes(m.metric_key as OipMetricKey)) {
            out[m.metric_key as OipMetricKey] = m.formatted_value;
        }
    }
    return out;
}

export function resolveOipStripValue(
    stripKey: MetricKey,
    oipValues: OipMetricStripValues | undefined
): string {
    const oipKey = oipMetricKeyForStripKey(stripKey);
    if (!oipKey) return "—";
    return oipValues?.[oipKey] ?? "—";
}

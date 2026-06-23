import type { MetricKey, WorkspaceKpiPlacementRow } from "@/lib/kpi/types";
import type { OipMetricKey } from "@/lib/metrics/types";
import type { ResolvedMetricMap } from "@/lib/metrics/fetchResolvedMetrics";
import { fetchResolvedMetrics } from "@/lib/metrics/fetchResolvedMetrics";
import { resolvedMetricsToStripValues } from "@/lib/kpi/workspaceOipExposure";

/** Workspace strip key → OIP MetricEngine key. */
export const OIP_STRIP_KEY_TO_METRIC: Record<string, OipMetricKey> = {
    "oip.enrollment.tour_conversion_rate": "enrollment.tour_conversion_rate",
    "oip.enrollment.time_to_schedule_tour": "enrollment.time_to_schedule_tour",
    "oip.ops.work_overdue_count": "ops.work_overdue_count",
    "oip.forms.completion_rate": "forms.completion_rate",
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
    workUnitId?: string | null;
    window?: string;
}): Promise<OipMetricStripValues> {
    const resolved = await fetchResolvedMetrics({
        keys: params.keys,
        siteId: params.siteId,
        workUnitId: params.workUnitId,
        window: (params.window as "rolling_30d" | undefined) ?? "rolling_30d",
    });
    return resolvedMetricsToStripValues(resolved);
}

/** Full MetricEngine resolve payload for analytics cards. */
export async function fetchOipMetricsResolved(params: {
    keys: OipMetricKey[];
    siteId?: string | null;
    workUnitId?: string | null;
    window?: string;
}): Promise<ResolvedMetricMap> {
    return fetchResolvedMetrics({
        keys: params.keys,
        siteId: params.siteId,
        workUnitId: params.workUnitId,
        window: (params.window as "rolling_30d" | undefined) ?? "rolling_30d",
    });
}

export function resolveOipStripValue(
    stripKey: MetricKey,
    oipValues: OipMetricStripValues | undefined
): string {
    const oipKey = oipMetricKeyForStripKey(stripKey);
    if (!oipKey) return "—";
    return oipValues?.[oipKey] ?? "—";
}

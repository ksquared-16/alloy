import { fetchOipMetricsResolved } from "@/lib/kpi/oipBridge";
import { listAvailableMetricPacks, listMetricPacks } from "@/lib/metrics/packs";
import type { ResolvedMetricMap } from "@/lib/metrics/fetchResolvedMetrics";
import { listKpiDefinitions } from "@/lib/metrics/kpiRegistry";
import type { OipKpiKey, OipMetricKey } from "@/lib/metrics/types";
import { workspaceDataFetchInit } from "@/lib/workspace/workspaceDataFetch";
import { isOffTrackStatus, normalizeOipHealthStatus, type OipHealthStatus } from "@/lib/metrics/oipStatusPresentation";

export type OipTargetApiItem = {
    kpi_key: OipKpiKey;
    label: string;
    metric_key: OipMetricKey;
    pack: string;
    target_kind: string;
    target_display: string;
    target: {
        target_max_hours: number | null;
        target_min_rate: number | null;
        target_max_count: number | null;
    };
    has_org_override: boolean;
};

export type OipKpiSnapshotRow = {
    kpi_key: OipKpiKey;
    label: string;
    pack: string;
    metric_key: OipMetricKey;
    target_display: string;
    current_display: string;
    status: OipHealthStatus;
    has_org_override: boolean;
};

export type OipSettingsSnapshot = {
    indicator_count: number;
    active_pack_count: number;
    off_track_count: number;
    last_updated: string;
    kpi_rows: OipKpiSnapshotRow[];
    targets: OipTargetApiItem[];
    resolved: ResolvedMetricMap;
    pack_status: Record<string, OipHealthStatus>;
};

function packStatusFromResolved(packKey: string, resolved: ResolvedMetricMap): OipHealthStatus {
    const pack = listMetricPacks().find((p) => p.key === packKey);
    if (!pack || pack.domainStatus !== "available") return "unknown";
    const statuses = pack.metricKeys
        .map((k) => normalizeOipHealthStatus(resolved[k]?.kpi?.status))
        .filter((s) => s !== "unknown");
    if (!statuses.length) return "unknown";
    if (statuses.some((s) => s === "critical")) return "critical";
    if (statuses.some((s) => s === "warning")) return "warning";
    if (statuses.every((s) => s === "healthy")) return "healthy";
    return "unknown";
}

export async function fetchOipSettingsSnapshot(): Promise<OipSettingsSnapshot> {
    const metricKeys = listAvailableMetricPacks().flatMap((p) => p.metricKeys);

    const [targetsRes, resolved] = await Promise.all([
        fetch("/api/admin/metrics/kpi-targets", workspaceDataFetchInit()),
        fetchOipMetricsResolved({ keys: metricKeys, window: "rolling_30d" }),
    ]);

    if (!targetsRes.ok) throw new Error("Unable to load targets");

    const targetsJson = (await targetsRes.json()) as { items: OipTargetApiItem[] };
    const targets = (targetsJson.items ?? []) as OipTargetApiItem[];

    const kpi_rows: OipKpiSnapshotRow[] = targets.map((t) => {
        const metric = resolved[t.metric_key];
        return {
            kpi_key: t.kpi_key,
            label: t.label,
            pack: t.pack,
            metric_key: t.metric_key,
            target_display: t.target_display,
            current_display: metric?.formatted_value ?? "—",
            status: normalizeOipHealthStatus(metric?.kpi?.status),
            has_org_override: t.has_org_override,
        };
    });

    const pack_status: Record<string, OipHealthStatus> = {};
    for (const pack of listMetricPacks()) {
        if (pack.domainStatus === "available" && pack.metricKeys.length) {
            pack_status[pack.key] = packStatusFromResolved(pack.key, resolved);
        }
    }

    return {
        indicator_count: listKpiDefinitions().length,
        active_pack_count: listAvailableMetricPacks().length,
        off_track_count: kpi_rows.filter((r) => isOffTrackStatus(r.status)).length,
        last_updated: new Date().toISOString(),
        kpi_rows,
        targets,
        resolved,
        pack_status,
    };
}

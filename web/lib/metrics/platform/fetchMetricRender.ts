import type { MetricPlacementRenderItem } from "@/lib/metrics/platform/renderMetricPlacements";

export type MetricRenderZones = Record<string, MetricPlacementRenderItem[]>;

export async function fetchMetricRenderBundle(params: {
    surface: string;
    surfaceKey?: string;
    placementZone?: string;
    contextType?: string;
    contextId?: string | null;
}): Promise<{ items: MetricPlacementRenderItem[]; zones?: MetricRenderZones }> {
    const qs = new URLSearchParams({ surface: params.surface });
    if (params.surfaceKey) qs.set("surface_key", params.surfaceKey);
    if (params.placementZone) qs.set("placement_zone", params.placementZone);
    if (params.contextType) qs.set("context_type", params.contextType);
    if (params.contextId) qs.set("context_id", params.contextId);

    const res = await fetch(`/api/admin/analytics/render?${qs.toString()}`, { credentials: "include" });
    if (!res.ok) return { items: [] };
    const data = (await res.json()) as { items?: MetricPlacementRenderItem[]; zones?: MetricRenderZones };
    return { items: data.items ?? [], zones: data.zones };
}

export async function runMetricSnapshots(body?: {
    metric_definition_ids?: string[];
    context_type?: string;
    context_id?: string;
    work_unit_id?: string;
}): Promise<{ written: number; skipped: number; errors: string[] }> {
    const res = await fetch("/api/admin/analytics/snapshots/run", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body ?? {}),
    });
    if (!res.ok) return { written: 0, skipped: 0, errors: ["Snapshot run failed"] };
    return res.json();
}

export async function copyMetricToOrg(metricId: string): Promise<{ item: unknown; copied: boolean } | null> {
    const res = await fetch(`/api/admin/analytics/metrics/${metricId}/copy`, {
        method: "POST",
        credentials: "include",
    });
    if (!res.ok) return null;
    return res.json();
}

export async function copyVisualizationToOrg(
    visualizationId: string,
    orgMetricDefinitionId: string
): Promise<{ item: unknown; copied: boolean } | null> {
    const res = await fetch(`/api/admin/analytics/visualizations/${visualizationId}/copy`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ metric_definition_id: orgMetricDefinitionId }),
    });
    if (!res.ok) return null;
    return res.json();
}

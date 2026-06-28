import type { MetricEvaluationResult, ResolvedMetricPlacement } from "@/lib/metrics/platform/types";

export type OiZonePlacements = Record<string, ResolvedMetricPlacement[]>;

export type MetricEvaluationMap = Record<string, MetricEvaluationResult>;

export async function fetchOiV2Placements(surfaceKey = "default"): Promise<OiZonePlacements> {
    const res = await fetch(
        `/api/admin/analytics/surfaces/operational_intelligence/placements?surface_key=${encodeURIComponent(surfaceKey)}`,
        { credentials: "include" }
    );
    const zones: OiZonePlacements = { overview: [], health: [], trends: [], comparisons: [] };
    if (!res.ok) return zones;

    const data = (await res.json()) as { items: ResolvedMetricPlacement[] };
    for (const item of data.items ?? []) {
        const zone = item.placement_zone as keyof OiZonePlacements;
        if (zone in zones) zones[zone]!.push(item);
    }
    return zones;
}

export async function previewMetricDefinition(
    definitionId: string,
    params?: { site_id?: string; work_unit_id?: string }
): Promise<MetricEvaluationResult | null> {
    const res = await fetch(`/api/admin/analytics/metrics/${definitionId}/preview`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(params ?? {}),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { evaluation: MetricEvaluationResult };
    return data.evaluation;
}

export async function fetchMetricDefinitions(): Promise<{ items: unknown[]; adapters: unknown[] }> {
    const res = await fetch("/api/admin/analytics/metrics", { credentials: "include" });
    if (!res.ok) return { items: [], adapters: [] };
    // API response contract: { ok, data: { items, adapters }, correlation_id }.
    const json = (await res.json().catch(() => null)) as {
        data?: { items?: unknown[]; adapters?: unknown[] };
    } | null;
    return { items: json?.data?.items ?? [], adapters: json?.data?.adapters ?? [] };
}

export async function fetchMetricVisualizations(): Promise<{ items: unknown[] }> {
    const res = await fetch("/api/admin/analytics/visualizations", { credentials: "include" });
    if (!res.ok) return { items: [] };
    return res.json();
}

export async function fetchMetricPlacementsList(): Promise<{ items: unknown[] }> {
    const res = await fetch("/api/admin/analytics/placements", { credentials: "include" });
    if (!res.ok) return { items: [] };
    return res.json();
}

export async function batchPreviewMetrics(
    definitionIds: string[]
): Promise<MetricEvaluationMap> {
    const map: MetricEvaluationMap = {};
    await Promise.all(
        definitionIds.map(async (id) => {
            const evaluation = await previewMetricDefinition(id);
            if (evaluation) map[id] = evaluation;
        })
    );
    return map;
}

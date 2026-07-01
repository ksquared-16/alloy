import type { SupabaseClient } from "@supabase/supabase-js";
import type {
    MetricDefinitionRow,
    MetricPlacementRow,
    MetricSurface,
    MetricVisualizationRow,
    ResolvedMetricPlacement,
} from "@/lib/metrics/platform/types";
import { isSourceKeyAvailable } from "@/lib/metrics/platform/metricSourceRegistry";

export async function loadMetricDefinitionsForOrg(
    supabase: SupabaseClient,
    orgId: string,
    status?: string
): Promise<MetricDefinitionRow[]> {
    let query = supabase
        .from("metric_definitions")
        .select("*")
        .or(`org_id.eq.${orgId},org_id.is.null`)
        .order("key");

    if (status) query = query.eq("status", status);

    const { data, error } = await query;
    if (error || !data) return [];
    return data as MetricDefinitionRow[];
}

export async function loadMetricDefinitionById(
    supabase: SupabaseClient,
    orgId: string,
    id: string
): Promise<MetricDefinitionRow | null> {
    const { data, error } = await supabase
        .from("metric_definitions")
        .select("*")
        .eq("id", id)
        .or(`org_id.eq.${orgId},org_id.is.null`)
        .maybeSingle();

    if (error || !data) return null;
    return data as MetricDefinitionRow;
}

export async function loadMetricDefinitionsByIds(
    supabase: SupabaseClient,
    orgId: string,
    ids: string[]
): Promise<MetricDefinitionRow[]> {
    if (!ids.length) return [];
    const { data, error } = await supabase
        .from("metric_definitions")
        .select("*")
        .in("id", ids)
        .or(`org_id.eq.${orgId},org_id.is.null`);

    if (error || !data) return [];
    return data as MetricDefinitionRow[];
}

export async function loadMetricVisualizationsForOrg(
    supabase: SupabaseClient,
    orgId: string
): Promise<MetricVisualizationRow[]> {
    const { data, error } = await supabase
        .from("metric_visualizations")
        .select("*")
        .or(`org_id.eq.${orgId},org_id.is.null`)
        .order("key");

    if (error || !data) return [];
    return data as MetricVisualizationRow[];
}

export async function loadMetricPlacementsForOrg(
    supabase: SupabaseClient,
    orgId: string
): Promise<MetricPlacementRow[]> {
    const { data, error } = await supabase
        .from("metric_placements")
        .select("*")
        .eq("org_id", orgId)
        .order("sort_order");

    if (error || !data) return [];
    return data as MetricPlacementRow[];
}

export async function resolvePlacementsForSurface(params: {
    supabase: SupabaseClient;
    orgId: string;
    surface: MetricSurface;
    surfaceKey?: string;
    placementZone?: string;
    activeOnly?: boolean;
}): Promise<ResolvedMetricPlacement[]> {
    const { supabase, orgId, surface, surfaceKey = "default", placementZone, activeOnly = true } = params;

    let placementQuery = supabase
        .from("metric_placements")
        .select("*")
        .eq("org_id", orgId)
        .eq("surface", surface)
        .eq("surface_key", surfaceKey)
        .order("sort_order");

    if (placementZone) placementQuery = placementQuery.eq("placement_zone", placementZone);
    if (activeOnly) placementQuery = placementQuery.in("status", ["active"]);

    const { data: placements, error: placementError } = await placementQuery;
    if (placementError || !placements?.length) return [];

    const vizIds = [...new Set(placements.map((p) => p.visualization_id))];
    const { data: visualizations } = await supabase
        .from("metric_visualizations")
        .select("*")
        .in("id", vizIds)
        .or(`org_id.eq.${orgId},org_id.is.null`);

    if (!visualizations?.length) return [];

    const defIds = [...new Set(visualizations.map((v) => v.metric_definition_id))];
    const { data: definitions } = await supabase
        .from("metric_definitions")
        .select("*")
        .in("id", defIds)
        .or(`org_id.eq.${orgId},org_id.is.null`);

    const vizMap = new Map(visualizations.map((v) => [v.id, v as MetricVisualizationRow]));
    const defMap = new Map((definitions ?? []).map((d) => [d.id, d as MetricDefinitionRow]));

    const resolved: ResolvedMetricPlacement[] = [];
    for (const p of placements as MetricPlacementRow[]) {
        const viz = vizMap.get(p.visualization_id);
        if (!viz || (activeOnly && viz.status !== "active")) continue;
        const def = defMap.get(viz.metric_definition_id);
        if (!def || (activeOnly && def.status !== "active")) continue;
        if (activeOnly && !isSourceKeyAvailable(def.source_key)) continue;

        const visibility = p.visibility_config as { visible?: boolean };
        if (visibility?.visible === false) continue;

        resolved.push({ ...p, visualization: viz, definition: def });
    }

    return resolved;
}

export async function resolveOiPlacementsByZone(
    supabase: SupabaseClient,
    orgId: string,
    surfaceKey = "default"
): Promise<Record<string, ResolvedMetricPlacement[]>> {
    const zones = ["overview", "health", "trends", "comparisons"] as const;
    const result: Record<string, ResolvedMetricPlacement[]> = {};

    for (const zone of zones) {
        result[zone] = await resolvePlacementsForSurface({
            supabase,
            orgId,
            surface: "operational_intelligence",
            surfaceKey,
            placementZone: zone,
        });
    }

    return result;
}

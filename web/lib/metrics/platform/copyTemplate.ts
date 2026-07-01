import type { SupabaseClient } from "@supabase/supabase-js";
import type { MetricDefinitionRow, MetricPlacementRow, MetricVisualizationRow } from "@/lib/metrics/platform/types";
import { loadMetricDefinitionById } from "@/lib/metrics/platform/placementResolver";

export async function copyGlobalMetricToOrg(
    supabase: SupabaseClient,
    orgId: string,
    sourceId: string,
    userId: string | null
): Promise<{ item: MetricDefinitionRow | null; error: string | null; copied: boolean }> {
    const source = await loadMetricDefinitionById(supabase, orgId, sourceId);
    if (!source) return { item: null, error: "Source metric not found", copied: false };

    const { data: existing } = await supabase
        .from("metric_definitions")
        .select("*")
        .eq("org_id", orgId)
        .eq("key", source.key)
        .maybeSingle();

    if (existing) return { item: existing as MetricDefinitionRow, error: null, copied: false };

    const { data, error } = await supabase
        .from("metric_definitions")
        .insert({
            org_id: orgId,
            key: source.key,
            label: source.label,
            description: source.description,
            category: source.category,
            entity_scope: source.entity_scope,
            source_type: source.source_type,
            source_key: source.source_key,
            aggregation: source.aggregation,
            numerator_config: source.numerator_config,
            denominator_config: source.denominator_config,
            filter_config: source.filter_config,
            dimension_config: source.dimension_config,
            default_period_config: source.default_period_config,
            unit: source.unit,
            precision: source.precision,
            is_kpi: source.is_kpi,
            target_config: source.target_config,
            threshold_config: source.threshold_config,
            status: "draft",
            version: 1,
            created_by: userId,
            updated_by: userId,
        })
        .select("*")
        .single();

    if (error) return { item: null, error: error.message, copied: false };
    return { item: data as MetricDefinitionRow, error: null, copied: true };
}

export async function copyGlobalVisualizationToOrg(
    supabase: SupabaseClient,
    orgId: string,
    sourceId: string,
    orgMetricDefinitionId: string
): Promise<{ item: MetricVisualizationRow | null; error: string | null; copied: boolean }> {
    const { data: source, error: loadErr } = await supabase
        .from("metric_visualizations")
        .select("*")
        .eq("id", sourceId)
        .maybeSingle();

    if (loadErr || !source) return { item: null, error: "Source visualization not found", copied: false };

    const { data: existing } = await supabase
        .from("metric_visualizations")
        .select("*")
        .eq("org_id", orgId)
        .eq("key", source.key)
        .maybeSingle();

    if (existing) return { item: existing as MetricVisualizationRow, error: null, copied: false };

    const { data, error } = await supabase
        .from("metric_visualizations")
        .insert({
            org_id: orgId,
            metric_definition_id: orgMetricDefinitionId,
            key: source.key,
            label: source.label,
            visualization_type: source.visualization_type,
            style_config: source.style_config,
            display_config: source.display_config,
            status: "draft",
            version: 1,
        })
        .select("*")
        .single();

    if (error) return { item: null, error: error.message, copied: false };
    return { item: data as MetricVisualizationRow, error: null, copied: true };
}

export async function copyGlobalPlacementToOrg(
    supabase: SupabaseClient,
    orgId: string,
    sourcePlacement: MetricPlacementRow,
    orgVisualizationId: string
): Promise<{ item: MetricPlacementRow | null; error: string | null; copied: boolean }> {
    const { data: existing } = await supabase
        .from("metric_placements")
        .select("*")
        .eq("org_id", orgId)
        .eq("visualization_id", orgVisualizationId)
        .eq("surface", sourcePlacement.surface)
        .eq("surface_key", sourcePlacement.surface_key)
        .eq("placement_zone", sourcePlacement.placement_zone)
        .maybeSingle();

    if (existing) return { item: existing as MetricPlacementRow, error: null, copied: false };

    const { data, error } = await supabase
        .from("metric_placements")
        .insert({
            org_id: orgId,
            visualization_id: orgVisualizationId,
            surface: sourcePlacement.surface,
            surface_key: sourcePlacement.surface_key,
            placement_zone: sourcePlacement.placement_zone,
            context_config: sourcePlacement.context_config,
            visibility_config: sourcePlacement.visibility_config,
            sort_order: sourcePlacement.sort_order,
            status: "draft",
            version: 1,
        })
        .select("*")
        .single();

    if (error) return { item: null, error: error.message, copied: false };
    return { item: data as MetricPlacementRow, error: null, copied: true };
}

/** Ensure org-owned copies exist for a global template chain. */
export async function ensureOrgMetricChainFromGlobal(
    supabase: SupabaseClient,
    orgId: string,
    globalMetricId: string,
    userId: string | null
): Promise<{ metric: MetricDefinitionRow; copied: boolean } | null> {
    const result = await copyGlobalMetricToOrg(supabase, orgId, globalMetricId, userId);
    if (!result.item) return null;
    return { metric: result.item, copied: result.copied };
}

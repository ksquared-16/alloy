/**
 * Shared placement persistence helpers — used by every metric-placement surface
 * (Operational Intelligence + headers). Resolve the pre-seeded oip_adapter definition for
 * a source key, and get-or-create the org-scoped visualization for a metric on a surface.
 * No new tables, no migrations.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { MetricVisualizationType } from "@/lib/metrics/platform/types";

/** Resolve the pre-seeded oip_adapter definition id for a source key (never creates definitions). */
export async function resolveDefinitionId(supabase: SupabaseClient, orgId: string, sourceKey: string): Promise<string | null> {
    const { data } = await supabase
        .from("metric_definitions")
        .select("id,status")
        .eq("source_type", "oip_adapter")
        .eq("source_key", sourceKey)
        .or(`org_id.eq.${orgId},org_id.is.null`)
        .order("status", { ascending: true })
        .limit(1)
        .maybeSingle();
    return data?.id ?? null;
}

/**
 * Get (or create) the org-scoped visualization for a metric on a surface, keeping its type
 * in sync. `keyPrefix` namespaces the visualization per surface (e.g. "oi", "wsh", "wuh")
 * so each surface can render the same metric with a different renderer.
 */
export async function ensureVisualizationId(
    supabase: SupabaseClient,
    orgId: string,
    keyPrefix: string,
    definitionId: string,
    sourceKey: string,
    vizType: MetricVisualizationType,
    label: string,
): Promise<string | null> {
    const key = `${keyPrefix}.${sourceKey}`;
    const { data: existing } = await supabase
        .from("metric_visualizations")
        .select("id,visualization_type")
        .eq("org_id", orgId)
        .eq("key", key)
        .maybeSingle();

    if (existing?.id) {
        if (existing.visualization_type !== vizType) {
            await supabase
                .from("metric_visualizations")
                .update({ visualization_type: vizType, label, updated_at: new Date().toISOString() })
                .eq("id", existing.id);
        }
        return existing.id;
    }

    const { data: created, error } = await supabase
        .from("metric_visualizations")
        .insert({
            org_id: orgId,
            metric_definition_id: definitionId,
            key,
            label,
            visualization_type: vizType,
            status: "active",
            version: 1,
        })
        .select("id")
        .single();
    if (error) return null;
    return created?.id ?? null;
}

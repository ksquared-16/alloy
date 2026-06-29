/**
 * Operational Intelligence surface persistence (server).
 *
 * Real load/save for the operational_intelligence surface against metric_placements,
 * using the existing placement resolver and admin Supabase client. The builder edits a
 * SurfaceDoc; this module maps that to placements (each backed by a visualization → a
 * pre-seeded oip_adapter definition).
 *
 * Narrow by design: Operational Intelligence only. No new tables, no migrations.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

import { resolvePlacementsForSurface } from "@/lib/metrics/platform/placementResolver";
import type { MetricVisualizationType } from "@/lib/metrics/platform/types";
import type { SurfaceDoc } from "@/lib/platform/surfaceBuilder/surfaceDefinition";
import {
    diffPlacements,
    placementsToSurfaceDoc,
    surfaceDocToDesiredPlacements,
    type OiPlacementView,
} from "@/lib/metrics/platform/operationalIntelligenceSurfaceMapping";

const SURFACE = "operational_intelligence" as const;
const VISIBLE = { version: 1, visible: true };
const HIDDEN = { version: 1, visible: false };

/** Flatten resolved placements (placement → visualization → definition) into the pure view. */
async function loadViews(supabase: SupabaseClient, orgId: string): Promise<OiPlacementView[]> {
    const resolved = await resolvePlacementsForSurface({ supabase, orgId, surface: SURFACE });
    return resolved
        .filter((p) => p.definition.source_type === "oip_adapter" && Boolean(p.definition.source_key))
        .map((p) => ({
            id: p.id,
            sourceKey: String(p.definition.source_key),
            vizType: p.visualization.visualization_type,
            label: p.visualization.label || p.definition.label || String(p.definition.source_key),
            zone: p.placement_zone,
            sortOrder: p.sort_order,
        }));
}

export async function loadOperationalIntelligenceDoc(supabase: SupabaseClient, orgId: string): Promise<SurfaceDoc> {
    return placementsToSurfaceDoc(await loadViews(supabase, orgId));
}

/** Resolve the pre-seeded oip_adapter definition id for a source key (does not create definitions). */
async function resolveDefinitionId(supabase: SupabaseClient, orgId: string, sourceKey: string): Promise<string | null> {
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

/** Get (or create) the org-scoped OI visualization for a metric, keeping its type in sync. */
async function ensureVisualizationId(
    supabase: SupabaseClient,
    orgId: string,
    definitionId: string,
    sourceKey: string,
    vizType: MetricVisualizationType,
    label: string,
): Promise<string | null> {
    const key = `oi.${sourceKey}`;
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

/**
 * Apply a SurfaceDoc to real placements: create new cards, update moved/reordered/retyped
 * cards, soft-remove (visibility=false) cards no longer present. Returns the reloaded doc.
 */
export async function saveOperationalIntelligenceDoc(
    supabase: SupabaseClient,
    orgId: string,
    doc: SurfaceDoc,
): Promise<SurfaceDoc> {
    const current = await loadViews(supabase, orgId);
    const desired = surfaceDocToDesiredPlacements(doc);
    const labelBySource = new Map(current.map((v) => [v.sourceKey, v.label]));
    const plan = diffPlacements(current, desired);

    // Creates
    for (const c of plan.creates) {
        const definitionId = await resolveDefinitionId(supabase, orgId, c.sourceKey);
        if (!definitionId) continue; // metric not available — skip rather than fake it
        const vizId = await ensureVisualizationId(supabase, orgId, definitionId, c.sourceKey, c.vizType, labelBySource.get(c.sourceKey) ?? c.sourceKey);
        if (!vizId) continue;
        await supabase.from("metric_placements").insert({
            org_id: orgId,
            visualization_id: vizId,
            surface: SURFACE,
            surface_key: "default",
            placement_zone: c.zone,
            context_config: { version: 1 },
            visibility_config: VISIBLE,
            sort_order: c.sortOrder,
            status: "active",
            version: 1,
        });
    }

    // Updates (zone / order / renderer / re-show)
    for (const u of plan.updates) {
        const definitionId = await resolveDefinitionId(supabase, orgId, u.sourceKey);
        if (!definitionId) continue;
        const vizId = await ensureVisualizationId(supabase, orgId, definitionId, u.sourceKey, u.vizType, labelBySource.get(u.sourceKey) ?? u.sourceKey);
        if (!vizId) continue;
        await supabase
            .from("metric_placements")
            .update({
                visualization_id: vizId,
                placement_zone: u.zone,
                sort_order: u.sortOrder,
                status: "active",
                visibility_config: VISIBLE,
                updated_at: new Date().toISOString(),
            })
            .eq("id", u.id)
            .eq("org_id", orgId);
    }

    // Removes (soft — visibility false; runtime resolver drops these)
    for (const r of plan.removes) {
        await supabase
            .from("metric_placements")
            .update({ visibility_config: HIDDEN, status: "hidden", updated_at: new Date().toISOString() })
            .eq("id", r.id)
            .eq("org_id", orgId);
    }

    return placementsToSurfaceDoc(await loadViews(supabase, orgId));
}

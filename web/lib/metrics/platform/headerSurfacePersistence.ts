/**
 * Header surface persistence (Workspace Header + Work Unit Header).
 *
 * Same metric_placements pattern as Operational Intelligence, but single-canvas (one
 * implicit section → one header zone), and it persists size + accent in
 * placement.context_config so Surfaces owns the full display treatment. No new tables.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

import { resolvePlacementsForSurface } from "@/lib/metrics/platform/placementResolver";
import { resolveDefinitionId, ensureVisualizationId } from "@/lib/metrics/platform/surfacePlacementHelpers";
import { cardTypeToVizType, vizTypeToCardType } from "@/lib/metrics/platform/operationalIntelligenceSurfaceMapping";
import type { MetricSurface, MetricVisualizationType } from "@/lib/metrics/platform/types";
import type { SurfaceDoc } from "@/lib/platform/surfaceBuilder/surfaceDefinition";
import { IMPLICIT_SECTION_ID } from "@/lib/platform/surfaceBuilder/surfaceBuilderModel";

export const HEADER_SURFACES = ["workspace_header", "work_unit_header"] as const;
export type HeaderSurface = (typeof HEADER_SURFACES)[number];

/**
 * The zone the RUNTIME reads for each header (must match the MetricPlacementRenderer calls):
 * - Workspace header → `primary_metrics` (WorkspaceOperationalPulseStrip primary strip)
 * - Work unit header → `header_metrics` (WorkUnitCommandSurface)
 * Writing to the runtime's zone is what makes /workspace + /work-unit reflect Publish.
 */
export const HEADER_ZONE_BY_SURFACE = {
    workspace_header: "primary_metrics",
    work_unit_header: "header_metrics",
} as const;
const KEY_PREFIX: Record<HeaderSurface, string> = { workspace_header: "wsh", work_unit_header: "wuh" };

export function isHeaderSurface(s: string): s is HeaderSurface {
    return (HEADER_SURFACES as readonly string[]).includes(s);
}

/** A flattened header placement (pure shape — no DB types). */
export type HeaderPlacementView = {
    id: string;
    sourceKey: string;
    vizType: MetricVisualizationType;
    label: string;
    sortOrder: number;
    size?: string;
    accent?: string;
};

export type DesiredHeaderPlacement = {
    sourceKey: string;
    vizType: MetricVisualizationType;
    sortOrder: number;
    size?: string;
    accent?: string;
};

/* ---- pure mapping (unit-testable) ---- */

/** Header placements → a single-section SurfaceDoc (size/accent carried in card config). */
export function headerViewsToDoc(views: readonly HeaderPlacementView[]): SurfaceDoc {
    const cards = [...views]
        .sort((a, b) => a.sortOrder - b.sortOrder)
        .map((v) => ({
            instanceId: v.id,
            cardTypeKey: vizTypeToCardType(v.vizType),
            contentId: v.sourceKey,
            config: {
                rendererKey: v.vizType,
                visibility: "on",
                ...(v.size ? { size: v.size } : {}),
                ...(v.accent ? { accent: v.accent } : {}),
            } as Record<string, unknown>,
        }));
    return { sections: [{ sectionId: IMPLICIT_SECTION_ID, title: "", cards }] };
}

/** SurfaceDoc → desired header placements (one metric per surface; size/accent from config). */
export function headerDocToDesired(doc: SurfaceDoc): DesiredHeaderPlacement[] {
    const out: DesiredHeaderPlacement[] = [];
    const seen = new Set<string>();
    for (const section of doc.sections) {
        section.cards.forEach((card) => {
            if (!card.contentId || seen.has(card.contentId)) return;
            const cfg = (card.config ?? {}) as Record<string, unknown>;
            const vizType = cardTypeToVizType(card.cardTypeKey, cfg.rendererKey);
            if (!vizType) return;
            seen.add(card.contentId);
            out.push({
                sourceKey: card.contentId,
                vizType,
                sortOrder: out.length * 10,
                ...(typeof cfg.size === "string" ? { size: cfg.size } : {}),
                ...(typeof cfg.accent === "string" ? { accent: cfg.accent } : {}),
            });
        });
    }
    return out;
}

export type HeaderPlacementPlan = {
    creates: DesiredHeaderPlacement[];
    updates: (DesiredHeaderPlacement & { id: string })[];
    removes: { id: string }[];
};

/** Diff by source_key (a metric appears at most once in a header). Idempotent re-publish. */
export function diffHeaderPlacements(current: readonly HeaderPlacementView[], desired: readonly DesiredHeaderPlacement[]): HeaderPlacementPlan {
    const byKey = new Map<string, HeaderPlacementView>();
    const dupes: HeaderPlacementView[] = [];
    for (const v of current) {
        if (byKey.has(v.sourceKey)) dupes.push(v);
        else byKey.set(v.sourceKey, v);
    }
    const desiredKeys = new Set(desired.map((d) => d.sourceKey));
    const creates: DesiredHeaderPlacement[] = [];
    const updates: (DesiredHeaderPlacement & { id: string })[] = [];
    for (const d of desired) {
        const ex = byKey.get(d.sourceKey);
        if (ex) updates.push({ ...d, id: ex.id });
        else creates.push(d);
    }
    const removes = [
        ...current.filter((v) => !desiredKeys.has(v.sourceKey)).map((v) => ({ id: v.id })),
        ...dupes.map((v) => ({ id: v.id })),
    ];
    return { creates, updates, removes };
}

/** Build the placement context_config (carries size/accent for runtime + reload). */
export function headerContextConfig(d: { size?: string; accent?: string }): Record<string, unknown> {
    return { version: 1, ...(d.size ? { size: d.size } : {}), ...(d.accent ? { accent: d.accent } : {}) };
}

/* ---- server load/save ---- */

async function loadViews(supabase: SupabaseClient, orgId: string, surface: HeaderSurface): Promise<HeaderPlacementView[]> {
    const resolved = await resolvePlacementsForSurface({ supabase, orgId, surface: surface as MetricSurface });
    return resolved
        .filter((p) => p.definition.source_type === "oip_adapter" && Boolean(p.definition.source_key))
        .map((p) => {
            const ctx = (p.context_config ?? {}) as Record<string, unknown>;
            return {
                id: p.id,
                sourceKey: String(p.definition.source_key),
                vizType: p.visualization.visualization_type,
                label: p.visualization.label || p.definition.label || String(p.definition.source_key),
                sortOrder: p.sort_order,
                size: typeof ctx.size === "string" ? ctx.size : undefined,
                accent: typeof ctx.accent === "string" ? ctx.accent : undefined,
            };
        });
}

export async function loadHeaderSurfaceDoc(supabase: SupabaseClient, orgId: string, surface: HeaderSurface): Promise<SurfaceDoc> {
    return headerViewsToDoc(await loadViews(supabase, orgId, surface));
}

export async function saveHeaderSurfaceDoc(supabase: SupabaseClient, orgId: string, surface: HeaderSurface, doc: SurfaceDoc): Promise<SurfaceDoc> {
    const current = await loadViews(supabase, orgId, surface);
    const desired = headerDocToDesired(doc);
    const labelBySource = new Map(current.map((v) => [v.sourceKey, v.label]));
    const plan = diffHeaderPlacements(current, desired);
    const prefix = KEY_PREFIX[surface];

    for (const c of plan.creates) {
        const definitionId = await resolveDefinitionId(supabase, orgId, c.sourceKey);
        if (!definitionId) continue;
        const vizId = await ensureVisualizationId(supabase, orgId, prefix, definitionId, c.sourceKey, c.vizType, labelBySource.get(c.sourceKey) ?? c.sourceKey);
        if (!vizId) continue;
        await supabase.from("metric_placements").insert({
            org_id: orgId,
            visualization_id: vizId,
            surface,
            surface_key: "default",
            placement_zone: HEADER_ZONE_BY_SURFACE[surface],
            context_config: headerContextConfig(c),
            visibility_config: { version: 1, visible: true },
            sort_order: c.sortOrder,
            status: "active",
            version: 1,
        });
    }

    for (const u of plan.updates) {
        const definitionId = await resolveDefinitionId(supabase, orgId, u.sourceKey);
        if (!definitionId) continue;
        const vizId = await ensureVisualizationId(supabase, orgId, prefix, definitionId, u.sourceKey, u.vizType, labelBySource.get(u.sourceKey) ?? u.sourceKey);
        if (!vizId) continue;
        await supabase
            .from("metric_placements")
            .update({
                visualization_id: vizId,
                placement_zone: HEADER_ZONE_BY_SURFACE[surface],
                sort_order: u.sortOrder,
                context_config: headerContextConfig(u),
                visibility_config: { version: 1, visible: true },
                status: "active",
                updated_at: new Date().toISOString(),
            })
            .eq("id", u.id)
            .eq("org_id", orgId);
    }

    for (const r of plan.removes) {
        await supabase
            .from("metric_placements")
            .update({ visibility_config: { version: 1, visible: false }, status: "hidden", updated_at: new Date().toISOString() })
            .eq("id", r.id)
            .eq("org_id", orgId);
    }

    return headerViewsToDoc(await loadViews(supabase, orgId, surface));
}

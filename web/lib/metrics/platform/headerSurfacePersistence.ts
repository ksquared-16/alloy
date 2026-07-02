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
import { getMetricSourceAdapter, humanizeSourceKey } from "@/lib/metrics/platform/metricSourceRegistry";
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
    showHealthChip?: boolean;
};

export type DesiredHeaderPlacement = {
    sourceKey: string;
    vizType: MetricVisualizationType;
    sortOrder: number;
    /** Configured card title (builder `config.title`) — persisted as the visualization label. */
    title?: string;
    size?: string;
    accent?: string;
    showHealthChip?: boolean;
};

/* ---- pure mapping (unit-testable) ---- */

/**
 * Header placements → a single-section SurfaceDoc (size/accent carried in card config).
 * The persisted visualization label surfaces back as `config.title` so the builder's
 * Title field round-trips (edit → publish → reload shows the configured title).
 */
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
                ...(v.label ? { title: v.label } : {}),
                ...(v.size ? { size: v.size } : {}),
                ...(v.accent ? { accent: v.accent } : {}),
                ...(v.showHealthChip !== undefined ? { showHealthChip: v.showHealthChip ? "on" : "off" } : {}),
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
            const title = typeof cfg.title === "string" ? cfg.title.trim() : "";
            out.push({
                sourceKey: card.contentId,
                vizType,
                sortOrder: out.length * 10,
                ...(title ? { title } : {}),
                ...(typeof cfg.size === "string" ? { size: cfg.size } : {}),
                ...(typeof cfg.accent === "string" ? { accent: cfg.accent } : {}),
                ...(cfg.showHealthChip === "on" ? { showHealthChip: true } : cfg.showHealthChip === "off" ? { showHealthChip: false } : {}),
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

/** Build the placement context_config (carries size/accent/showHealthChip for runtime + reload). */
export function headerContextConfig(d: { size?: string; accent?: string; showHealthChip?: boolean }): Record<string, unknown> {
    return {
        version: 1,
        ...(d.size ? { size: d.size } : {}),
        ...(d.accent ? { accent: d.accent } : {}),
        ...(d.showHealthChip !== undefined ? { showHealthChip: d.showHealthChip } : {}),
    };
}

/* ---- server load/save ---- */

/**
 * Get the active oip_adapter definition for a source key, creating an org-scoped one on
 * demand when no active global definition exists (e.g. ops.work_overdue_count before the
 * 20260707 migration runs, or enrollment.lead_count which was draft in the original seeds).
 * Only creates for source keys registered as "available" in the adapter registry.
 */
async function ensureDefinitionId(supabase: SupabaseClient, orgId: string, sourceKey: string): Promise<string | null> {
    const existing = await resolveDefinitionId(supabase, orgId, sourceKey);
    if (existing) return existing;

    // Not in DB — only auto-create for source keys the adapter registry considers available.
    const adapter = getMetricSourceAdapter(sourceKey);
    if (!adapter || adapter.status !== "available") return null;

    const { data, error } = await supabase
        .from("metric_definitions")
        .insert({
            org_id: orgId,
            key: sourceKey.replace(".", "_"),
            label: adapter.label,
            description: `${adapter.label} — auto-created for header surface`,
            category: sourceKey.split(".")[0] ?? "ops",
            entity_scope: "org",
            source_type: "oip_adapter",
            source_key: sourceKey,
            aggregation: adapter.supportedAggregations[0] ?? "count",
            filter_config: {},
            dimension_config: {},
            unit: "count",
            precision: 0,
            is_kpi: true,
            status: "active",
            version: 1,
        })
        .select("id")
        .single();
    if (error) {
        console.warn(`[HeaderSurface] auto-create definition failed for ${sourceKey}:`, error.message);
        return null;
    }
    return data?.id ?? null;
}

/**
 * Load the flattened placement views for a header surface (org-scoped, active + visible
 * only, sort_order ascending). `placementZone` narrows to the runtime zone — the workspace
 * first-paint loader reads exactly what the header runtime renders.
 */
export async function loadHeaderSurfaceViews(
    supabase: SupabaseClient,
    orgId: string,
    surface: HeaderSurface,
    placementZone?: string,
): Promise<HeaderPlacementView[]> {
    const resolved = await resolvePlacementsForSurface({
        supabase,
        orgId,
        surface: surface as MetricSurface,
        ...(placementZone ? { placementZone } : {}),
    });
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
                showHealthChip: typeof ctx.showHealthChip === "boolean" ? ctx.showHealthChip : undefined,
            };
        });
}

export async function loadHeaderSurfaceDoc(supabase: SupabaseClient, orgId: string, surface: HeaderSurface): Promise<SurfaceDoc> {
    return headerViewsToDoc(await loadHeaderSurfaceViews(supabase, orgId, surface));
}

/**
 * The label a header card persists to `metric_visualizations.label`: the configured title
 * wins; otherwise keep the currently-persisted label; otherwise the registry/humanized
 * fallback (never the raw source key).
 */
function desiredHeaderLabel(d: DesiredHeaderPlacement, labelBySource: Map<string, string>): string {
    return (
        d.title ??
        labelBySource.get(d.sourceKey) ??
        getMetricSourceAdapter(d.sourceKey)?.label ??
        humanizeSourceKey(d.sourceKey)
    );
}

/**
 * `ensureVisualizationId` only writes the label on create / renderer change — sync an
 * existing visualization's label when the configured title differs from what is stored.
 */
async function syncVisualizationLabel(
    supabase: SupabaseClient,
    orgId: string,
    vizId: string,
    label: string,
    currentLabel: string | undefined,
): Promise<void> {
    if (label === currentLabel) return;
    await supabase
        .from("metric_visualizations")
        .update({ label, updated_at: new Date().toISOString() })
        .eq("id", vizId)
        .eq("org_id", orgId);
}

export async function saveHeaderSurfaceDoc(supabase: SupabaseClient, orgId: string, surface: HeaderSurface, doc: SurfaceDoc): Promise<SurfaceDoc> {
    const current = await loadHeaderSurfaceViews(supabase, orgId, surface);
    const desired = headerDocToDesired(doc);
    const labelBySource = new Map(current.map((v) => [v.sourceKey, v.label]));
    const plan = diffHeaderPlacements(current, desired);
    const prefix = KEY_PREFIX[surface];

    for (const c of plan.creates) {
        const definitionId = await ensureDefinitionId(supabase, orgId, c.sourceKey);
        if (!definitionId) {
            console.warn(`[HeaderSurface] skipping create for unknown source key: ${c.sourceKey}`);
            continue;
        }
        const createLabel = desiredHeaderLabel(c, labelBySource);
        const vizId = await ensureVisualizationId(supabase, orgId, prefix, definitionId, c.sourceKey, c.vizType, createLabel);
        if (!vizId) continue;
        // A visualization may already exist from a previously-removed placement — make the
        // configured title stick regardless of the ensure path taken.
        if (c.title) await syncVisualizationLabel(supabase, orgId, vizId, createLabel, labelBySource.get(c.sourceKey));
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
        const definitionId = await ensureDefinitionId(supabase, orgId, u.sourceKey);
        if (!definitionId) {
            console.warn(`[HeaderSurface] skipping update for unknown source key: ${u.sourceKey}`);
            continue;
        }
        const updateLabel = desiredHeaderLabel(u, labelBySource);
        const vizId = await ensureVisualizationId(supabase, orgId, prefix, definitionId, u.sourceKey, u.vizType, updateLabel);
        if (!vizId) continue;
        // Persist a configured title onto the existing visualization (ensure only writes
        // the label when the renderer type changes).
        if (u.title) await syncVisualizationLabel(supabase, orgId, vizId, updateLabel, labelBySource.get(u.sourceKey));
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

    return headerViewsToDoc(await loadHeaderSurfaceViews(supabase, orgId, surface));
}

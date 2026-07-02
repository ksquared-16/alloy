/**
 * WS.HEADER first paint — server loader for the PUBLISHED "Workspace Header" surface.
 *
 * Loads the org's `metric_placements` for surface="workspace_header" / surface_key=
 * "default" / zone="primary_metrics" (the exact rows /settings/surfaces publishes) and
 * resolves their calculation values through the MetricEngine, producing the
 * `WorkspaceHeaderCalculationCardVm[]` the workspace Route VM carries so the header strip
 * is data-complete at first commit.
 *
 * Resilient by contract: ANY failure returns null — the workspace layout never blocks on
 * this loader, and the client runtime falls back to the code-owned default strip.
 */

import { createAdminClient } from "@/lib/supabaseAdmin";
import { loadAdminRouteGate } from "@/lib/admin/adminRouteGate";
import { resolveMetrics } from "@/lib/metrics/metricEngine";
import { isKnownOipMetricKey } from "@/lib/metrics/registry";
import type { OipMetricKey } from "@/lib/metrics/types";
import {
    HEADER_ZONE_BY_SURFACE,
    loadHeaderSurfaceViews,
} from "@/lib/metrics/platform/headerSurfacePersistence";
import {
    workspaceHeaderCardVmsFromViews,
    type WorkspaceHeaderCalculationCardVm,
    type WorkspaceHeaderResolvedValue,
} from "@/lib/presentation/runtime/workspaceHeaderCards";

export type { WorkspaceHeaderCalculationCardVm } from "@/lib/presentation/runtime/workspaceHeaderCards";

/**
 * Load the published Workspace Header cards with server-resolved values. Returns null when
 * the org has no published surface (client falls back) or on any error (never blocks the
 * layout's parallel first-paint bundle).
 */
export async function loadWorkspaceHeaderFirstPaint(): Promise<
    WorkspaceHeaderCalculationCardVm[] | null
> {
    try {
        const gate = await loadAdminRouteGate();
        if (!gate.ok) return null;
        const supabase = createAdminClient();

        const views = await loadHeaderSurfaceViews(
            supabase,
            gate.orgId,
            "workspace_header",
            HEADER_ZONE_BY_SURFACE.workspace_header,
        );
        if (!views.length) return null;

        // Resolve values for the distinct calculation keys. Value resolution failing must
        // not drop the published cards — they render as no-data ("—"/unknown) and the
        // client warm cache refines them in place.
        const resolvedBySource = new Map<string, WorkspaceHeaderResolvedValue>();
        const keys = [...new Set(views.map((v) => v.sourceKey))].filter((k): k is OipMetricKey =>
            isKnownOipMetricKey(k),
        );
        if (keys.length) {
            try {
                const { data: orgSettings } = await supabase
                    .from("org_settings")
                    .select("metadata")
                    .eq("org_id", gate.orgId)
                    .maybeSingle();
                const orgMetadata = (orgSettings as { metadata?: unknown } | null)?.metadata ?? null;

                const results = await resolveMetrics({
                    ctx: {
                        supabase,
                        orgId: gate.orgId,
                        scope: gate.dimRaw,
                        window: "rolling_30d",
                        mode: "live",
                    },
                    keys,
                    orgMetadata,
                    includeKpi: true,
                });
                for (const row of results) {
                    resolvedBySource.set(row.metric.key, {
                        formattedValue: row.metric.formattedValue,
                        status: row.kpi?.status ?? null,
                    });
                }
            } catch (e) {
                console.error("[workspaceHeaderFirstPaint] value resolve failed:", e);
            }
        }

        return workspaceHeaderCardVmsFromViews(views, (sourceKey) => resolvedBySource.get(sourceKey) ?? null);
    } catch (e) {
        console.error("[workspaceHeaderFirstPaint] load failed:", e);
        return null;
    }
}

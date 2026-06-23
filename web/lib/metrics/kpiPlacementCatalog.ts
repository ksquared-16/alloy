import type { OipKpiKey, OipMetricKey } from "@/lib/metrics/types";
import { listKpiDefinitions } from "@/lib/metrics/kpiRegistry";
import { getMetricDefinition } from "@/lib/metrics/registry";
import { DEFAULT_WORKSPACE_OIP_STRIP_KEYS, DEFAULT_WORK_UNIT_OIP_STRIP_KEYS } from "@/lib/kpi/workspaceOipExposure";
import { oipMetricKeyForStripKey } from "@/lib/kpi/oipBridge";

export type KpiPlacementSurface =
    | "workspace_strip"
    | "work_unit_strip"
    | "analytics_modal"
    | "lifecycle_tile";

export type KpiPlacementCatalogRow = {
    kpi_key: OipKpiKey;
    label: string;
    metric_key: OipMetricKey;
    pack: string;
    surfaces: readonly KpiPlacementSurface[];
    notes?: string;
};

const SURFACE_LABELS: Record<KpiPlacementSurface, string> = {
    workspace_strip: "Workspace strip",
    work_unit_strip: "Work unit strip",
    analytics_modal: "Analytics modal",
    lifecycle_tile: "Lifecycle tile",
};

export function kpiPlacementSurfaceLabel(surface: KpiPlacementSurface): string {
    return SURFACE_LABELS[surface];
}

/** Code-owned default placement visibility (Phase 3 — read-only catalog). */
export function listKpiPlacementCatalog(): readonly KpiPlacementCatalogRow[] {
    const workspaceMetrics = new Set(
        DEFAULT_WORKSPACE_OIP_STRIP_KEYS.map((k) => oipMetricKeyForStripKey(k)).filter(Boolean)
    );
    const workUnitMetrics = new Set(
        DEFAULT_WORK_UNIT_OIP_STRIP_KEYS.map((k) => oipMetricKeyForStripKey(k)).filter(Boolean)
    );

    return listKpiDefinitions().map((def) => {
        const surfaces: KpiPlacementSurface[] = ["analytics_modal"];
        if (workspaceMetrics.has(def.metricKey)) surfaces.push("workspace_strip");
        if (workUnitMetrics.has(def.metricKey)) surfaces.push("work_unit_strip");
        if (def.pack === "enrollment" || def.pack === "forms") {
            surfaces.push("lifecycle_tile");
        }
        return {
            kpi_key: def.key,
            label: def.label,
            metric_key: def.metricKey,
            pack: def.pack,
            surfaces,
            notes: getMetricDefinition(def.metricKey).description,
        };
    });
}

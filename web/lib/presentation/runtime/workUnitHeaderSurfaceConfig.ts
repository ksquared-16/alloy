/**
 * Work Unit Header Surface config (pure).
 *
 * Title, subtitle, and 3–5 work-unit-scoped KPI slots for `/workspace/work-unit/:slug`.
 * KPI values resolve from Operational Calculations scoped with `workUnitId` at runtime.
 *
 * Persistence: `entity_layouts` (surface="workspace", entityType="workspace",
 * layoutKey="work_unit_header") with config in `doc.metadata.workUnitHeaderSurface`.
 */

import {
    buildWorkspaceHeaderPresentation,
    normalizeWorkspaceHeaderSurfaceConfig,
    workspaceHeaderKpiSourceKeys,
    type WorkspaceHeaderKpiSlot,
    type WorkspaceHeaderPresentationModel,
    type WorkspaceHeaderSurfaceConfig,
} from "@/lib/presentation/runtime/workspaceHeaderSurfaceConfig";

export const WORK_UNIT_HEADER_LAYOUT_KEY = "work_unit_header";

export type WorkUnitHeaderKpiSlot = WorkspaceHeaderKpiSlot;
export type WorkUnitHeaderSurfaceConfig = WorkspaceHeaderSurfaceConfig;
export type WorkUnitHeaderKpiVm = WorkspaceHeaderPresentationModel["kpis"][number];
export type WorkUnitHeaderPresentationModel = WorkspaceHeaderPresentationModel;

/** Default work-unit KPI set when no surface is published. */
export const DEFAULT_WORK_UNIT_HEADER_KPIS: readonly WorkUnitHeaderKpiSlot[] = [
    {
        slot: 1,
        enabled: true,
        label: "Needs attention",
        icon: "users",
        sourceKey: "ops.needs_attention_count",
        accent: null,
    },
    {
        slot: 2,
        enabled: true,
        label: "Overdue work",
        icon: "clipboard",
        sourceKey: "ops.work_overdue_count",
        accent: "gold",
    },
    {
        slot: 3,
        enabled: true,
        label: "Pipeline Children",
        icon: "chart",
        sourceKey: "enrollment.active_leads",
        accent: null,
    },
    { slot: 4, enabled: false, label: null, icon: "calendar", sourceKey: "enrollment.tour_completed_count", accent: null },
    { slot: 5, enabled: false, label: null, icon: "grid", sourceKey: "forms.completion_rate", accent: null },
];

export const DEFAULT_WORK_UNIT_HEADER_SURFACE_CONFIG: WorkUnitHeaderSurfaceConfig = {
    version: 1,
    title: null,
    subtitle: null,
    kpis: DEFAULT_WORK_UNIT_HEADER_KPIS.map((k) => ({ ...k })),
};

export function normalizeWorkUnitHeaderSurfaceConfig(raw: unknown): WorkUnitHeaderSurfaceConfig {
    const normalized = normalizeWorkspaceHeaderSurfaceConfig(raw);
    if (!raw || typeof raw !== "object") {
        return {
            ...normalized,
            kpis: DEFAULT_WORK_UNIT_HEADER_KPIS.map((k) => ({ ...k })),
        };
    }
    return normalized;
}

export const buildWorkUnitHeaderPresentation = buildWorkspaceHeaderPresentation;

import type { ResolvedMetricMap } from "@/lib/metrics/fetchResolvedMetrics";

export function buildWorkUnitHeaderPresentationForRuntime(
    config: WorkUnitHeaderSurfaceConfig,
    args: {
        fallbackTitle: string | null;
        fallbackSubtitle: string | null;
        resolved?: ResolvedMetricMap | null;
    },
): WorkUnitHeaderPresentationModel {
    const title = config.title?.trim() || args.fallbackTitle?.trim() || "Work Unit";
    const subtitle = config.subtitle?.trim() || args.fallbackSubtitle?.trim() || null;
    return buildWorkspaceHeaderPresentation(
        { ...config, title, subtitle },
        { fallbackTitle: title, resolved: args.resolved },
    );
}

export function workUnitHeaderKpiSourceKeys(config: WorkUnitHeaderSurfaceConfig) {
    return workspaceHeaderKpiSourceKeys(config);
}

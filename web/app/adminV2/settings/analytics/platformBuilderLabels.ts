/** Operator-facing labels — platform keys stay in code/API. */

export const BUILDER_TAB_LABELS = {
    metrics: "Calculations",
    visualizations: "Display styles",
    placements: "Where it appears",
    rollups: "Combined scores",
} as const;

export const METRIC_STATUS_LABELS: Record<string, { label: string; tone: "neutral" | "success" | "warning" | "muted" }> = {
    active: { label: "Published", tone: "success" },
    draft: { label: "Draft", tone: "warning" },
    archived: { label: "Archived", tone: "muted" },
};

export const VIZ_TYPE_LABELS: Record<string, string> = {
    kpi_card: "KPI card",
    trend_card: "Trend card",
    chip: "Compact chip",
    sparkline: "Sparkline",
    line_chart: "Line chart",
    comparison: "Comparison card",
    scorecard: "Multi-metric scorecard",
};

export const VIZ_TYPE_HINTS: Record<string, string> = {
    kpi_card: "Single value with health state — best for one KPI.",
    trend_card: "Value plus trend sparkline over time.",
    chip: "Compact inline metric for dense headers.",
    sparkline: "Minimal trend line without full card chrome.",
    line_chart: "Line chart for time-series detail.",
    comparison: "Current value vs prior period.",
    scorecard: "One card showing multiple related metrics together.",
};

export const MULTI_METRIC_VIZ_TYPES = new Set(["scorecard", "kpi_card"]);

export const ACCENT_OPTIONS: { key: string; label: string; swatch: string; ring: string }[] = [
    { key: "enrollment", label: "Enrollment green", swatch: "bg-alloy-juniper", ring: "ring-alloy-juniper/40" },
    { key: "operational", label: "Operational slate", swatch: "bg-alloy-midnight/70", ring: "ring-alloy-midnight/30" },
    { key: "forms", label: "Forms violet", swatch: "bg-violet-500", ring: "ring-violet-400/40" },
    { key: "communications", label: "Communications blue", swatch: "bg-alloy-blue", ring: "ring-alloy-blue/40" },
];

export type SurfaceKey = "operational_intelligence" | "workspace_header" | "work_unit_header" | "business_process_tile";

export const SURFACE_OPTIONS: {
    key: SurfaceKey;
    label: string;
    description: string;
}[] = [
    {
        key: "operational_intelligence",
        label: "Operational Intelligence",
        description: "The analytics panel operators open from the workspace.",
    },
    {
        key: "workspace_header",
        label: "Workspace header",
        description: "Primary operational pulse on the workspace home view.",
    },
    {
        key: "work_unit_header",
        label: "Work unit header",
        description: "KPI strip above a work unit queue.",
    },
    {
        key: "business_process_tile",
        label: "Business process tile",
        description: "Metrics preview on each process navigation tile.",
    },
];

export const ZONE_LABELS: Record<string, Record<string, string>> = {
    operational_intelligence: {
        overview: "Overview section",
        health: "Health section",
        trends: "Trends section",
        comparisons: "Comparisons section",
    },
    workspace_header: {
        primary_metrics: "Primary metrics row",
        secondary_metrics: "Secondary metrics row",
    },
    work_unit_header: {
        header_metrics: "Header metrics",
    },
    business_process_tile: {
        tile_metrics: "Tile metrics",
    },
};

export function humanPlacementLabel(surface: string, zone: string): string {
    const surfaceLabel = SURFACE_OPTIONS.find((s) => s.key === surface)?.label ?? surface.replace(/_/g, " ");
    const zoneLabel = ZONE_LABELS[surface]?.[zone] ?? zone.replace(/_/g, " ");
    return `${surfaceLabel} — ${zoneLabel}`;
}

export function slugifyMetricKey(label: string): string {
    return label
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "_")
        .replace(/^_+|_+$/g, "")
        .slice(0, 64) || "metric";
}

export const SNAPSHOT_RUN_STORAGE_KEY = "analytics_v2_last_snapshot_run_at";

import type { KPIVm } from "@/lib/ui-v2/workspace-types";

/** DB row shape for `workspace_kpi_placement` (API returns camelCase). */
export type WorkspaceKpiPlacementRow = {
    id: string;
    org_id: string;
    surface: "workspace" | "department" | "work_unit";
    department_id: string | null;
    work_unit_id: string | null;
    metric_key: string;
    display_order: number;
    is_visible: boolean;
    label_override: string | null;
    format_override: string | null;
    lane_override: "business" | "ai" | null;
    metadata: Record<string, unknown> | null;
    created_at?: string;
    updated_at?: string;
};

export type KpiSurface = "workspace" | "department" | "work_unit";

export type MetricKey =
    | "org.structure.departments_count"
    | "org.structure.work_units_count"
    | "org.pipeline.active_in_motion"
    | "org.pipeline.pipeline_value_open"
    | "org.pipeline.closed_outcomes"
    | "org.enrollment.active_leads"
    | "org.enrollment.scheduled_tours"
    | "org.enrollment.in_motion"
    | "org.enrollment.waitlisted_families"
    | "ctx.workspace.total_in_scope"
    | "dept.wu_queue.total_per_work_unit"
    | "ctx.dept.total_in_scope"
    | "ctx.dept.queue_total"
    | "ctx.dept.needs_attention_count"
    | "wu.queue.selected_tab_count"
    | "wu.queue.primary_lane_total"
    | "ctx.wu.total_in_queue"
    | "ctx.wu.selected_queue_count"
    | "ctx.wu.primary_lane_total"
    | "ctx.wu.needs_attention_count"
    | "oip.enrollment.tour_conversion_rate"
    | "oip.enrollment.time_to_schedule_tour"
    | "oip.ops.work_overdue_count"
    | "oip.ops.needs_attention_count"
    | "oip.forms.completion_rate";

export type MetricFamily = "L" | "Q" | "S" | "R" | "O";

export type MetricDefinition = {
    key: MetricKey;
    family: MetricFamily;
    allowedSurfaces: KpiSurface[];
    defaultLabel: string;
    defaultLane: KPIVm["lane"];
    /** Simplified; formatting follows KPIVm conventions in resolver */
    defaultFormat: "count" | "currency" | "percent" | "duration" | "text";
};

export type ResolveKpisResult = {
    items: KPIVm[];
    warnings: string[];
};

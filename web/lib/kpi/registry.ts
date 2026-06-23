import type { MetricDefinition, KpiSurface, MetricKey } from "@/lib/kpi/types";

const DEFINITIONS: Record<MetricKey, MetricDefinition> = {
    "org.structure.departments_count": {
        key: "org.structure.departments_count",
        family: "S",
        allowedSurfaces: ["workspace"],
        defaultLabel: "Departments",
        defaultLane: "business",
        defaultFormat: "count",
    },
    "org.structure.work_units_count": {
        key: "org.structure.work_units_count",
        family: "S",
        allowedSurfaces: ["workspace"],
        defaultLabel: "Work units",
        defaultLane: "business",
        defaultFormat: "count",
    },
    "org.pipeline.active_in_motion": {
        key: "org.pipeline.active_in_motion",
        family: "R",
        allowedSurfaces: ["workspace"],
        defaultLabel: "Active pipeline",
        defaultLane: "business",
        defaultFormat: "count",
    },
    "org.pipeline.pipeline_value_open": {
        key: "org.pipeline.pipeline_value_open",
        family: "R",
        allowedSurfaces: ["workspace"],
        defaultLabel: "Pipeline value",
        defaultLane: "business",
        defaultFormat: "currency",
    },
    "org.pipeline.closed_outcomes": {
        key: "org.pipeline.closed_outcomes",
        family: "R",
        allowedSurfaces: ["workspace"],
        defaultLabel: "Closed outcomes",
        defaultLane: "business",
        defaultFormat: "count",
    },
    "org.enrollment.active_leads": {
        key: "org.enrollment.active_leads",
        family: "R",
        allowedSurfaces: ["workspace"],
        defaultLabel: "Active Leads",
        defaultLane: "business",
        defaultFormat: "count",
    },
    "org.enrollment.scheduled_tours": {
        key: "org.enrollment.scheduled_tours",
        family: "R",
        allowedSurfaces: ["workspace"],
        defaultLabel: "Scheduled Tours",
        defaultLane: "business",
        defaultFormat: "count",
    },
    "org.enrollment.in_motion": {
        key: "org.enrollment.in_motion",
        family: "R",
        allowedSurfaces: ["workspace"],
        defaultLabel: "Enrollment Opportunities",
        defaultLane: "business",
        defaultFormat: "count",
    },
    "org.enrollment.waitlisted_families": {
        key: "org.enrollment.waitlisted_families",
        family: "R",
        allowedSurfaces: ["workspace"],
        defaultLabel: "Waitlisted Families",
        defaultLane: "business",
        defaultFormat: "count",
    },
    "ctx.workspace.total_in_scope": {
        key: "ctx.workspace.total_in_scope",
        family: "L",
        allowedSurfaces: ["workspace"],
        defaultLabel: "Opportunities in pipeline scope",
        defaultLane: "business",
        defaultFormat: "count",
    },
    "dept.wu_queue.total_per_work_unit": {
        key: "dept.wu_queue.total_per_work_unit",
        family: "Q",
        allowedSurfaces: ["department"],
        defaultLabel: "Work unit",
        defaultLane: "business",
        defaultFormat: "count",
    },
    "ctx.dept.total_in_scope": {
        key: "ctx.dept.total_in_scope",
        family: "Q",
        allowedSurfaces: ["department"],
        defaultLabel: "Total in department",
        defaultLane: "business",
        defaultFormat: "count",
    },
    "ctx.dept.queue_total": {
        key: "ctx.dept.queue_total",
        family: "Q",
        allowedSurfaces: ["department"],
        defaultLabel: "Queue heads (dept)",
        defaultLane: "business",
        defaultFormat: "count",
    },
    "ctx.dept.needs_attention_count": {
        key: "ctx.dept.needs_attention_count",
        family: "Q",
        allowedSurfaces: ["department"],
        defaultLabel: "Needs attention",
        defaultLane: "business",
        defaultFormat: "count",
    },
    "wu.queue.selected_tab_count": {
        key: "wu.queue.selected_tab_count",
        family: "Q",
        allowedSurfaces: ["work_unit"],
        defaultLabel: "Selected queue",
        defaultLane: "business",
        defaultFormat: "count",
    },
    "wu.queue.primary_lane_total": {
        key: "wu.queue.primary_lane_total",
        family: "Q",
        allowedSurfaces: ["work_unit"],
        defaultLabel: "Primary lane",
        defaultLane: "business",
        defaultFormat: "count",
    },
    "ctx.wu.total_in_queue": {
        key: "ctx.wu.total_in_queue",
        family: "Q",
        allowedSurfaces: ["work_unit"],
        defaultLabel: "All queues total",
        defaultLane: "business",
        defaultFormat: "count",
    },
    "ctx.wu.selected_queue_count": {
        key: "ctx.wu.selected_queue_count",
        family: "Q",
        allowedSurfaces: ["work_unit"],
        defaultLabel: "This queue",
        defaultLane: "business",
        defaultFormat: "count",
    },
    "ctx.wu.primary_lane_total": {
        key: "ctx.wu.primary_lane_total",
        family: "Q",
        allowedSurfaces: ["work_unit"],
        defaultLabel: "First lane total",
        defaultLane: "business",
        defaultFormat: "count",
    },
    "ctx.wu.needs_attention_count": {
        key: "ctx.wu.needs_attention_count",
        family: "Q",
        allowedSurfaces: ["work_unit"],
        defaultLabel: "Needs attention",
        defaultLane: "business",
        defaultFormat: "count",
    },
    "oip.enrollment.tour_conversion_rate": {
        key: "oip.enrollment.tour_conversion_rate",
        family: "O",
        allowedSurfaces: ["workspace", "work_unit"],
        defaultLabel: "Tour conversion",
        defaultLane: "business",
        defaultFormat: "percent",
    },
    "oip.enrollment.time_to_schedule_tour": {
        key: "oip.enrollment.time_to_schedule_tour",
        family: "O",
        allowedSurfaces: ["workspace", "work_unit"],
        defaultLabel: "Time to tour",
        defaultLane: "business",
        defaultFormat: "duration",
    },
    "oip.ops.work_overdue_count": {
        key: "oip.ops.work_overdue_count",
        family: "O",
        allowedSurfaces: ["workspace", "work_unit"],
        defaultLabel: "Overdue work",
        defaultLane: "business",
        defaultFormat: "count",
    },
};

const KEYS = new Set<string>(Object.keys(DEFINITIONS));

export function isKnownMetricKey(key: string): key is MetricKey {
    return KEYS.has(key);
}

export function getMetricDefinition(key: MetricKey): MetricDefinition {
    return DEFINITIONS[key];
}

export function validateMetricForSurface(key: MetricKey, surface: KpiSurface): boolean {
    return getMetricDefinition(key).allowedSurfaces.includes(surface);
}

/** Registry catalog for settings UI and placement creation allowlists. */
export function listMetricDefinitions(): readonly MetricDefinition[] {
    return Object.freeze(Object.values(DEFINITIONS));
}

/** Human-readable “unit” line for settings (maps `defaultFormat`, not a separate DB field). */
export function metricFormatUnitLabel(format: MetricDefinition["defaultFormat"]): string {
    switch (format) {
        case "count":
            return "Count";
        case "currency":
            return "Currency";
        case "percent":
            return "Percent";
        case "duration":
            return "Duration";
        case "text":
            return "Text";
        default:
            return "—";
    }
}

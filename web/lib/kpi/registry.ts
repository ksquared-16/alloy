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
    "dept.wu_queue.total_per_work_unit": {
        key: "dept.wu_queue.total_per_work_unit",
        family: "Q",
        allowedSurfaces: ["department"],
        defaultLabel: "Work unit",
        defaultLane: "business",
        defaultFormat: "count",
    },
    "wu.queue.selected_tab_count": {
        key: "wu.queue.selected_tab_count",
        family: "Q",
        allowedSurfaces: ["work_unit"],
        defaultLabel: "In queue",
        defaultLane: "business",
        defaultFormat: "count",
    },
    "wu.queue.primary_lane_total": {
        key: "wu.queue.primary_lane_total",
        family: "Q",
        allowedSurfaces: ["work_unit"],
        defaultLabel: "Lane total",
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

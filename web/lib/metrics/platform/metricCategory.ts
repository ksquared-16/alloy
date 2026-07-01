/** Operator-facing metric categories — stored as stable keys in metric_definitions.category. */

export type MetricCategoryKey =
    | "enrollment"
    | "attendance"
    | "billing"
    | "staffing"
    | "communications"
    | "operational_health"
    | "compliance"
    | "general";

export const METRIC_CATEGORY_OPTIONS: { key: MetricCategoryKey; label: string }[] = [
    { key: "enrollment", label: "Enrollment" },
    { key: "attendance", label: "Attendance" },
    { key: "billing", label: "Billing" },
    { key: "staffing", label: "Staffing" },
    { key: "communications", label: "Communications" },
    { key: "operational_health", label: "Operational health" },
    { key: "compliance", label: "Compliance" },
    { key: "general", label: "General" },
];

const SOURCE_PREFIX_CATEGORY: Record<string, MetricCategoryKey> = {
    enrollment: "enrollment",
    attendance: "attendance",
    billing: "billing",
    staffing: "staffing",
    comms: "communications",
    ops: "operational_health",
    forms: "compliance",
};

export function deriveMetricCategoryFromSource(sourceKey: string): MetricCategoryKey {
    const prefix = sourceKey.split(".")[0] ?? "";
    return SOURCE_PREFIX_CATEGORY[prefix] ?? "general";
}

export function metricCategoryLabel(categoryKey: string): string {
    return METRIC_CATEGORY_OPTIONS.find((o) => o.key === categoryKey)?.label ?? categoryKey.replace(/_/g, " ");
}

export function normalizeMetricCategoryKey(raw: string): MetricCategoryKey {
    const match = METRIC_CATEGORY_OPTIONS.find((o) => o.key === raw || o.label.toLowerCase() === raw.toLowerCase());
    return match?.key ?? "general";
}

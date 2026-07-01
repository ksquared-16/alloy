import type { SupabaseClient } from "@supabase/supabase-js";
import type { MetricAggregation } from "@/lib/metrics/platform/types";
import type { OipMetricKey } from "@/lib/metrics/types";
import { isKnownOipMetricKey } from "@/lib/metrics/registry";

export type MetricSourceAdapterStatus = "available" | "disabled" | "coming_soon";

export type MetricSourceFilterDef = {
    key: string;
    label: string;
    type: "string" | "number" | "boolean" | "uuid";
};

export type MetricSourceDimensionDef = {
    key: string;
    label: string;
};

export type MetricSourceAdapter = {
    key: string;
    label: string;
    status: MetricSourceAdapterStatus;
    supportedAggregations: readonly MetricAggregation[];
    supportedFilters: readonly MetricSourceFilterDef[];
    supportedDimensions: readonly MetricSourceDimensionDef[];
    /** Maps to OIP metric key when status is available. */
    oipMetricKey?: OipMetricKey;
    todo?: string;
};

const ADAPTERS: Record<string, MetricSourceAdapter> = {
    "enrollment.tour_conversion_rate": {
        key: "enrollment.tour_conversion_rate",
        label: "Tour conversion",
        status: "available",
        supportedAggregations: ["rate", "count"],
        supportedFilters: [
            { key: "site_id", label: "Site", type: "uuid" },
            { key: "status_key", label: "Status", type: "string" },
        ],
        supportedDimensions: [
            { key: "lifecycle_stage", label: "Lifecycle stage" },
            { key: "status_key", label: "Status" },
        ],
        oipMetricKey: "enrollment.tour_conversion_rate",
    },
    "enrollment.time_to_schedule_tour": {
        key: "enrollment.time_to_schedule_tour",
        label: "Time to schedule tour",
        status: "available",
        supportedAggregations: ["median", "avg"],
        supportedFilters: [{ key: "site_id", label: "Site", type: "uuid" }],
        supportedDimensions: [
            { key: "lifecycle_stage", label: "Lifecycle stage" },
            { key: "status_key", label: "Status" },
        ],
        oipMetricKey: "enrollment.time_to_schedule_tour",
    },
    "enrollment.lead_count": {
        key: "enrollment.lead_count",
        label: "Lead count",
        status: "available",
        supportedAggregations: ["count"],
        supportedFilters: [{ key: "site_id", label: "Site", type: "uuid" }],
        supportedDimensions: [{ key: "lifecycle_stage", label: "Lifecycle stage" }],
        oipMetricKey: "enrollment.lead_count",
    },
    "enrollment.tour_completed_count": {
        key: "enrollment.tour_completed_count",
        label: "Completed tours",
        status: "available",
        supportedAggregations: ["count"],
        supportedFilters: [{ key: "site_id", label: "Site", type: "uuid" }],
        supportedDimensions: [],
        oipMetricKey: "enrollment.tour_completed_count",
    },
    "ops.needs_attention_count": {
        key: "ops.needs_attention_count",
        label: "Needs attention",
        status: "available",
        supportedAggregations: ["count"],
        supportedFilters: [{ key: "work_unit_id", label: "Work unit", type: "uuid" }],
        supportedDimensions: [],
        oipMetricKey: "ops.needs_attention_count",
    },
    "ops.work_overdue_count": {
        key: "ops.work_overdue_count",
        label: "Overdue work",
        status: "available",
        supportedAggregations: ["count"],
        supportedFilters: [{ key: "work_unit_id", label: "Work unit", type: "uuid" }],
        supportedDimensions: [],
        oipMetricKey: "ops.work_overdue_count",
    },
    "forms.completion_rate": {
        key: "forms.completion_rate",
        label: "Forms completion rate",
        status: "available",
        supportedAggregations: ["rate"],
        supportedFilters: [],
        supportedDimensions: [],
        oipMetricKey: "forms.completion_rate",
    },
    "comms.delivery_rate": {
        key: "comms.delivery_rate",
        label: "Comms delivery rate",
        status: "available",
        supportedAggregations: ["rate"],
        supportedFilters: [],
        supportedDimensions: [],
        oipMetricKey: "comms.delivery_rate",
    },
    "enrollment.pipeline_value": {
        key: "enrollment.pipeline_value",
        label: "Pipeline value",
        status: "disabled",
        supportedAggregations: ["sum"],
        supportedFilters: [],
        supportedDimensions: [],
        todo: "No safe authoritative pipeline value source — disabled until financial truth path exists.",
    },
    "queue.work_unit_total": {
        key: "queue.work_unit_total",
        label: "Work unit queue total",
        status: "coming_soon",
        supportedAggregations: ["count"],
        supportedFilters: [{ key: "work_unit_id", label: "Work unit", type: "uuid" }],
        supportedDimensions: [],
        todo: "Queue adapter — preview only, not authoritative.",
    },
};

export function listMetricSourceAdapters(): MetricSourceAdapter[] {
    return Object.values(ADAPTERS);
}

/**
 * Convert a dot-notation source key to a readable label as a last-resort fallback.
 * Uses only the final segment so "ops.work_overdue_count" → "Work overdue count".
 * Prefer adapter label or definition label over this; use only when those are absent.
 */
export function humanizeSourceKey(sourceKey: string): string {
    const lastSegment = sourceKey.split(".").pop() ?? sourceKey;
    const spaced = lastSegment.replace(/_/g, " ");
    return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

/**
 * Resolve the display label for a metric tile, applying a fallback chain to prevent
 * raw source keys from reaching the UI regardless of what was stored in the DB.
 *
 * Priority:
 *  1. labelOverride (user/builder explicit title)
 *  2. viz.label — but only if it is NOT the raw source key
 *  3. definition.label
 *  4. Adapter registry label
 *  5. humanizeSourceKey as final safe fallback
 */
/**
 * Derive a safe accent key from a metric's health state when no explicit accent is configured.
 * Maps health states to the closest semantic accent: healthy→green, warning→amber, critical→red.
 * Falls back to "neutral" for unknown/no-data states so tiles don't appear falsely healthy.
 */
export function resolveAccentFromHealth(healthState: string | undefined): string {
    if (healthState === "healthy") return "enrollment";
    if (healthState === "warning") return "amber";
    if (healthState === "critical") return "critical";
    return "neutral";
}

export function resolveMetricDisplayLabel(
    vizLabel: string,
    defLabel: string,
    sourceKey: string,
): string {
    const raw = vizLabel?.trim();
    if (raw && raw !== sourceKey) return raw;
    if (defLabel?.trim()) return defLabel.trim();
    return getMetricSourceAdapter(sourceKey)?.label ?? humanizeSourceKey(sourceKey);
}

export function getMetricSourceAdapter(sourceKey: string): MetricSourceAdapter | null {
    return ADAPTERS[sourceKey] ?? null;
}

export function assertKnownSourceKey(sourceKey: string): MetricSourceAdapter {
    const adapter = getMetricSourceAdapter(sourceKey);
    if (!adapter) {
        throw new Error(`Unknown metric source key: ${sourceKey}`);
    }
    return adapter;
}

export function isSourceKeyAvailable(sourceKey: string): boolean {
    const adapter = getMetricSourceAdapter(sourceKey);
    return adapter?.status === "available";
}

export function resolveOipMetricKeyFromSource(sourceKey: string): OipMetricKey | null {
    const adapter = getMetricSourceAdapter(sourceKey);
    if (!adapter || adapter.status !== "available" || !adapter.oipMetricKey) return null;
    if (!isKnownOipMetricKey(adapter.oipMetricKey)) return null;
    return adapter.oipMetricKey;
}

/** Validate source_key + aggregation combo at config write time. */
export function validateSourceAggregation(sourceKey: string, aggregation: MetricAggregation): void {
    const adapter = assertKnownSourceKey(sourceKey);
    if (adapter.status !== "available") {
        throw new Error(`Source adapter ${sourceKey} is ${adapter.status}: ${adapter.todo ?? "not available"}`);
    }
    if (!adapter.supportedAggregations.includes(aggregation)) {
        throw new Error(
            `Aggregation ${aggregation} not supported for ${sourceKey}. Supported: ${adapter.supportedAggregations.join(", ")}`
        );
    }
}

/** Validate filter keys against adapter catalog. */
export function validateSourceFilters(sourceKey: string, filters: Record<string, string | number | boolean | null>): void {
    const adapter = assertKnownSourceKey(sourceKey);
    const allowed = new Set(adapter.supportedFilters.map((f) => f.key));
    for (const key of Object.keys(filters)) {
        if (!allowed.has(key)) {
            throw new Error(`Filter ${key} not allowed for source ${sourceKey}`);
        }
    }
}

/** Validate dimension keys against adapter catalog. */
export function validateSourceDimensions(sourceKey: string, dimensions: Record<string, string>): void {
    const adapter = assertKnownSourceKey(sourceKey);
    const allowed = new Set(adapter.supportedDimensions.map((d) => d.key));
    for (const key of Object.keys(dimensions)) {
        if (!allowed.has(key)) {
            throw new Error(`Dimension ${key} not allowed for source ${sourceKey}`);
        }
    }
}

export async function listSourceAdaptersForAdmin(_supabase: SupabaseClient): Promise<MetricSourceAdapter[]> {
    return listMetricSourceAdapters();
}

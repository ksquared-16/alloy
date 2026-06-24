import type { SupabaseClient } from "@supabase/supabase-js";
import type { AdminAccessScopeDimensions } from "@/lib/admin/accessScope";

/** Operational Intelligence Platform metric keys (code-owned registry). */
export type OipMetricKey =
    | "enrollment.time_to_schedule_tour"
    | "enrollment.tour_conversion_rate"
    | "comms.delivery_rate"
    | "comms.reply_rate"
    | "comms.failed_delivery_count"
    | "forms.completion_rate"
    | "forms.packet_completion_time"
    | "ops.work_overdue_count"
    | "ops.workflow_failure_rate"
    | "ops.needs_attention_count"
    | "ops.readiness_gap_count";

export type OipKpiKey =
    | "enrollment.time_to_schedule_tour"
    | "enrollment.tour_conversion_rate"
    | "comms.delivery_rate"
    | "forms.completion_rate"
    | "ops.work_overdue_count"
    | "ops.needs_attention_count";

export type MetricComputationKind =
    | "event_window"
    | "entity_snapshot"
    | "evaluator_snapshot";

export type MetricFormat = "count" | "percent" | "duration" | "currency" | "rate";

export type MetricTimeWindowKey = "rolling_24h" | "rolling_7d" | "rolling_30d";

export type MetricResolveMode = "live" | "snapshot";

export type MetricPackKey =
    | "enrollment"
    | "communications"
    | "forms"
    | "operational_health"
    | "capacity";

export type MetricDimensionKey = "lifecycle_stage" | "status_key";

export type MetricDimensions = Partial<Record<MetricDimensionKey, string>>;

export type MetricDefinition = {
    key: OipMetricKey;
    label: string;
    description: string;
    pack: MetricPackKey;
    computationKind: MetricComputationKind;
    format: MetricFormat;
    defaultWindow: MetricTimeWindowKey;
    sources: readonly string[];
    /** When true, value is a bounded point-in-time or capped scan — not exhaustive org truth. */
    snapshotSemantics?: boolean;
    supportsDimensions?: readonly MetricDimensionKey[];
};

export type KpiHealthStatus = "healthy" | "warning" | "critical" | "unknown";

export type KpiTargetKind = "duration_max_hours" | "rate_min" | "count_max";

export type KpiThresholds = {
    healthyMaxHours?: number;
    warningMaxHours?: number;
    healthyMinRate?: number;
    warningMinRate?: number;
    healthyMaxCount?: number;
    warningMaxCount?: number;
};

export type KpiTargetConfig = {
    metricKey: OipMetricKey;
    kind: KpiTargetKind;
    targetMaxHours?: number;
    targetMinRate?: number;
    targetMaxCount?: number;
    thresholds: KpiThresholds;
};

export type KpiDefinition = {
    key: OipKpiKey;
    label: string;
    metricKey: OipMetricKey;
    pack: MetricPackKey;
    owner: string;
    defaultTarget: KpiTargetConfig;
};

export type ResolvedMetricValue = {
    key: OipMetricKey;
    label: string;
    format: MetricFormat;
    value: number | null;
    formattedValue: string;
    window: MetricTimeWindowKey;
    windowStartIso: string;
    windowEndIso: string;
    computedAtIso: string;
    sources: readonly string[];
    resolveMode: MetricResolveMode;
    meta?: Record<string, unknown>;
};

export type ResolvedKpiEvaluation = {
    key: OipKpiKey;
    label: string;
    metricKey: OipMetricKey;
    status: KpiHealthStatus;
    targetKind: KpiTargetKind;
    targetMaxHours?: number;
    targetMinRate?: number;
    targetMaxCount?: number;
    thresholds: KpiThresholds;
    observedValueHours?: number | null;
    observedValueRate?: number | null;
    observedValueCount?: number | null;
};

export type MetricResolveResult = {
    metric: ResolvedMetricValue;
    kpi?: ResolvedKpiEvaluation;
};

export type MetricResolveContext = {
    supabase: SupabaseClient;
    orgId: string;
    scope: AdminAccessScopeDimensions;
    window: MetricTimeWindowKey;
    siteLocationId?: string | null;
    dimensions?: MetricDimensions;
    now?: Date;
    mode?: MetricResolveMode;
    workUnitId?: string | null;
};

export type MetricSourceMetadata = {
    key: OipMetricKey;
    pack: MetricPackKey;
    computation_kind: MetricComputationKind;
    sources: readonly string[];
    snapshot_semantics?: boolean;
    supports_dimensions?: readonly MetricDimensionKey[];
};

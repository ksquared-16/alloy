import type { SupabaseClient } from "@supabase/supabase-js";
import type { AdminAccessScopeDimensions } from "@/lib/admin/accessScope";

/** Operational Intelligence Platform metric keys (code-owned registry). */
export type OipMetricKey =
    | "attendance.expected_count"
    | "attendance.here_now_count"
    | "attendance.not_arrived_count"
    | "attendance.checked_out_count"
    | "attendance.known_away_count"
    | "attendance.unknown_state_count"
    | "enrollment.time_to_schedule_tour"
    | "enrollment.tour_conversion_rate"
    | "enrollment.lead_count"
    | "enrollment.active_leads"
    | "enrollment.active_families"
    | "enrollment.new_leads"
    | "enrollment.waitlisted"
    | "enrollment.tour_completed_count"
    | "comms.delivery_rate"
    | "comms.reply_rate"
    | "comms.failed_delivery_count"
    | "forms.completion_rate"
    | "forms.packet_completion_time"
    | "ops.work_overdue_count"
    | "ops.workflow_failure_rate"
    | "ops.needs_attention_count"
    | "ops.readiness_gap_count"
    // Financials — money, and only where a canonical owner already answers for it.
    //
    // Every one of these is a THREAD'S figure, scoped and summed by
    // `resolvers/financialsMetrics.ts`. None is computed in the metric layer, none is
    // derived from journal rows, and none is called Accounts Receivable or Revenue:
    // the platform has no receivables accounting and no revenue-recognition model, so
    // the names say what the numbers actually are.
    | "financials.outstanding_amount"
    | "financials.currently_collectible_amount"
    | "financials.gross_charges_posted_amount"
    | "financials.payments_received_amount"
    | "financials.unapplied_payments_amount"
    | "financials.unresolved_subsidy_variance_amount"
    | "financials.charges_awaiting_post_count"
    // Trust — governed reasoning execution. Every source is a Trust Runtime
    // append-only record. Nothing here reads provider identity or recommendation
    // content from a Decision Package (ADR-2).
    | "trust.governed_decisions_created"
    | "trust.governed_decisions_completed"
    | "trust.recommendation_rate"
    | "trust.governed_refusal_rate"
    | "trust.reasoning_failure_rate"
    | "trust.deterministic_resolution_rate"
    | "trust.escalated_decision_count"
    | "trust.reasoning_latency_p50"
    | "trust.provider_cost_units"
    | "trust.executions_committed_count";

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
    | "capacity"
    | "attendance"
    | "financials"
    /**
     * Governed reasoning execution. A presentation grouping, not a Business
     * Process — Trust is platform infrastructure every capability consumes, so
     * `PACK_TO_BUSINESS_PROCESS` maps it onto operational health rather than
     * inventing a Trust business process.
     */
    | "trust";

/**
 * Whether a stored snapshot may ever stand in for this metric's value.
 *
 * `eligible` is the platform's historical behaviour and stays the default: the
 * generic writer may persist the metric, and `mode=snapshot` may serve the most
 * recent stored row.
 *
 * `live_only` says the metric represents CURRENT STATE, so a stored historical
 * value must never substitute for it. This is not a performance preference — it
 * is a correctness contract. `resolveSingleMetric` will not consult
 * `metric_snapshots` for such a metric even when snapshot resolution is asked
 * for, and the generic writer will not persist one even if it is named
 * explicitly.
 *
 * ── WHY THIS IS NOT `snapshotSemantics` ──
 *
 * `snapshotSemantics` means "the value is a bounded point-in-time or capped scan
 * rather than exhaustive org truth" — a statement about COMPLETENESS. Several
 * metrics carry it and are still snapshotted quite correctly
 * (`enrollment.active_leads` is both). The question here is different and
 * narrower: may yesterday's number be shown as today's? Reusing one flag for both
 * would make every future reader guess which meaning applied.
 *
 * ── WHY THE DEFAULT IS THE PERMISSIVE ONE ──
 *
 * Because every metric that existed before this contract was snapshot-eligible,
 * and silently changing that would be a behaviour change disguised as a type
 * change. The safety therefore comes from the lock test over the live-only set
 * rather than from the default: adding or removing a live-only metric has to be
 * done deliberately, in a place that says so.
 */
export type MetricSnapshotPolicy = "eligible" | "live_only";

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
    /**
     * Whether a stored snapshot may substitute for this metric. Defaults to
     * `eligible`, which is the behaviour every metric had before this existed.
     * See `MetricSnapshotPolicy`.
     */
    snapshotPolicy?: MetricSnapshotPolicy;
    supportsDimensions?: readonly MetricDimensionKey[];
    /**
     * When true, the metric's source data carries no site or work-unit linkage,
     * so it can only ever be answered org-wide.
     *
     * A narrowed scope must then be REPORTED as unsupported — never silently
     * answered with the org-wide number, which would read as a site figure. The
     * snapshot writer also skips site targets for these, so no misleading
     * site-scoped row is ever persisted.
     */
    orgScopeOnly?: boolean;
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

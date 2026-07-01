/** Analytics V2 Metric Platform — canonical types. */

export type MetricDefinitionStatus = "draft" | "active" | "archived";
export type MetricVisualizationStatus = "draft" | "active" | "archived";
export type MetricPlacementStatus = "draft" | "active" | "archived" | "hidden";
export type MetricRollupStatus = "draft" | "active" | "archived";

export type MetricEntityScope = "org" | "site" | "department" | "work_unit" | "record";

export type MetricSourceType = "oip_adapter" | "queue_adapter" | "forms_adapter" | "disabled";

export type MetricAggregation =
    | "count"
    | "sum"
    | "avg"
    | "rate"
    | "median"
    | "min"
    | "max"
    | "ratio";

export type MetricUnit = "none" | "count" | "percent" | "currency" | "duration" | "rate";

export type MetricVisualizationType =
    | "kpi_card"
    | "trend_card"
    | "sparkline"
    | "line_chart"
    | "area_chart"
    | "bar_chart"
    | "comparison"
    | "gauge"
    | "scorecard"
    | "table"
    | "chip";

export type MetricSurface =
    | "workspace_header"
    | "business_process_tile"
    | "work_unit_header"
    | "drawer"
    | "operational_intelligence"
    | "dashboard"
    | "report"
    | "portal"
    | "mobile";

export type MetricPlacementZone =
    | "overview"
    | "health"
    | "trends"
    | "comparisons"
    | "header"
    | "footer"
    | "sidebar"
    | "primary_metrics"
    | "secondary_metrics"
    | "header_metrics"
    | "tile_metrics";

export type MetricRollupType =
    | "sum"
    | "avg"
    | "weighted_avg"
    | "best"
    | "worst"
    | "composite_score"
    | "health_score";

export type MetricHealthState = "healthy" | "warning" | "critical" | "unknown";

export type MetricTrendDirection = "up" | "down" | "flat";

export type MetricTrendSentiment = "good" | "bad" | "neutral";

export type MetricPeriodKind = "rolling" | "week_over_week" | "month_over_month" | "quarter_over_quarter" | "custom";

export type MetricPeriodConfig = {
    version: 1;
    kind: MetricPeriodKind;
    days?: number;
    startIso?: string;
    endIso?: string;
};

export type MetricFilterConfig = {
    version: 1;
    filters?: Record<string, string | number | boolean | null>;
};

export type MetricDimensionConfig = {
    version: 1;
    dimensions?: Record<string, string>;
};

export type MetricTargetConfig = {
    version: 1;
    kind: "duration_max_hours" | "rate_min" | "rate_max" | "count_max" | "count_min";
    targetMaxHours?: number;
    targetMinRate?: number;
    targetMaxRate?: number;
    targetMaxCount?: number;
    targetMinCount?: number;
    direction?: "higher_is_better" | "lower_is_better";
};

export type MetricThresholdConfig = {
    version: 1;
    healthyMaxHours?: number;
    warningMaxHours?: number;
    healthyMinRate?: number;
    warningMinRate?: number;
    healthyMaxCount?: number;
    warningMaxCount?: number;
    healthyMaxRate?: number;
    warningMaxRate?: number;
};

export type MetricDefinitionRow = {
    id: string;
    org_id: string | null;
    key: string;
    label: string;
    description: string;
    category: string;
    entity_scope: MetricEntityScope;
    source_type: MetricSourceType;
    source_key: string;
    aggregation: MetricAggregation;
    numerator_config: Record<string, unknown> | null;
    denominator_config: Record<string, unknown> | null;
    filter_config: MetricFilterConfig;
    dimension_config: MetricDimensionConfig;
    default_period_config: MetricPeriodConfig;
    unit: MetricUnit;
    precision: number;
    is_kpi: boolean;
    target_config: MetricTargetConfig | null;
    threshold_config: MetricThresholdConfig | null;
    status: MetricDefinitionStatus;
    version: number;
    created_at: string;
    updated_at: string;
    created_by: string | null;
    updated_by: string | null;
};

export type MetricVisualizationRow = {
    id: string;
    org_id: string | null;
    metric_definition_id: string;
    key: string;
    label: string;
    visualization_type: MetricVisualizationType;
    style_config: Record<string, unknown>;
    display_config: Record<string, unknown>;
    version: number;
    status: MetricVisualizationStatus;
    created_at: string;
    updated_at: string;
};

export type MetricPlacementRow = {
    id: string;
    org_id: string;
    visualization_id: string;
    surface: MetricSurface;
    surface_key: string;
    placement_zone: MetricPlacementZone;
    context_config: Record<string, unknown>;
    visibility_config: Record<string, unknown>;
    sort_order: number;
    status: MetricPlacementStatus;
    version: number;
    created_at: string;
    updated_at: string;
};

export type MetricPlatformSnapshotRow = {
    id: string;
    org_id: string;
    metric_definition_id: string;
    context_type: string;
    context_id: string | null;
    period_start: string;
    period_end: string;
    granularity: string;
    value: number | null;
    numerator_value: number | null;
    denominator_value: number | null;
    dimension_values: Record<string, unknown> | null;
    health_state: MetricHealthState;
    computed_at: string;
    created_at: string;
};

export type MetricRollupRow = {
    id: string;
    org_id: string;
    key: string;
    label: string;
    rollup_type: MetricRollupType;
    child_metric_config: Record<string, unknown>;
    context_scope: string;
    weight_config: Record<string, unknown> | null;
    threshold_config: Record<string, unknown> | null;
    status: MetricRollupStatus;
    version: number;
    created_at: string;
    updated_at: string;
};

export type MetricEvaluationContext = {
    orgId: string;
    contextType?: string;
    contextId?: string | null;
    siteLocationId?: string | null;
    workUnitId?: string | null;
    period?: MetricPeriodConfig;
    filters?: Record<string, unknown>;
    dimensions?: Record<string, string>;
    now?: Date;
};

export type MetricEvaluationResult = {
    metricDefinitionId: string;
    key: string;
    label: string;
    unit: MetricUnit;
    value: number | null;
    numeratorValue: number | null;
    denominatorValue: number | null;
    formattedValue: string;
    healthState: MetricHealthState;
    periodStart: string;
    periodEnd: string;
    computedAt: string;
    meta?: Record<string, unknown>;
};

export type ResolvedMetricPlacement = MetricPlacementRow & {
    visualization: MetricVisualizationRow;
    definition: MetricDefinitionRow;
};

export type MetricTrendComparison = {
    current: MetricEvaluationResult | MetricPlatformSnapshotRow;
    previous: MetricEvaluationResult | MetricPlatformSnapshotRow | null;
    deltaValue: number | null;
    deltaPercent: number | null;
    direction: MetricTrendDirection;
    sentiment: MetricTrendSentiment;
};

export type BosMetricSummary = {
    key: string;
    label: string;
    value: number | null;
    formattedValue: string;
    healthState: MetricHealthState;
    unit: MetricUnit;
    periodStart: string;
    periodEnd: string;
};

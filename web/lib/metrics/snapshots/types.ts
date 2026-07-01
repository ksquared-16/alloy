import type { MetricTimeWindowKey, OipMetricKey } from "@/lib/metrics/types";

export type MetricSnapshotScopeType = "org" | "site" | "department" | "work_unit";

export type MetricSnapshotRow = {
    id: string;
    org_id: string;
    metric_key: string;
    window_key: string;
    scope_type: MetricSnapshotScopeType;
    scope_id: string | null;
    dimension_key: string | null;
    dimension_value: string | null;
    value_numeric: number | null;
    value_json: Record<string, unknown>;
    computed_at: string;
    created_at: string;
};

export type MetricSnapshotWriteInput = {
    orgId: string;
    metricKey: OipMetricKey;
    windowKey: MetricTimeWindowKey;
    scopeType?: MetricSnapshotScopeType;
    scopeId?: string | null;
    dimensionKey?: string | null;
    dimensionValue?: string | null;
    valueNumeric: number | null;
    valueJson?: Record<string, unknown>;
    computedAt: string;
};

export type MetricSnapshotReadQuery = {
    orgId: string;
    metricKey: OipMetricKey;
    windowKey: MetricTimeWindowKey;
    scopeType?: MetricSnapshotScopeType;
    scopeId?: string | null;
    dimensionKey?: string | null;
    dimensionValue?: string | null;
    /** Reject snapshots older than this many ms (default 24h). */
    maxAgeMs?: number;
};

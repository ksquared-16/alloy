import type {
    MetricEvaluationResult,
    MetricPlatformSnapshotRow,
    MetricTargetConfig,
    MetricTrendComparison,
    MetricTrendDirection,
    MetricTrendSentiment,
} from "@/lib/metrics/platform/types";

function extractValue(row: MetricEvaluationResult | MetricPlatformSnapshotRow): number | null {
    if ("value" in row && row.value != null) return row.value;
    return null;
}

export function calculateDeltaValue(current: number | null, previous: number | null): number | null {
    if (current == null || previous == null) return null;
    if (!Number.isFinite(current) || !Number.isFinite(previous)) return null;
    return current - previous;
}

export function calculateDeltaPercent(current: number | null, previous: number | null): number | null {
    if (current == null || previous == null) return null;
    if (!Number.isFinite(current) || !Number.isFinite(previous)) return null;
    if (previous === 0) return current === 0 ? 0 : null;
    return ((current - previous) / Math.abs(previous)) * 100;
}

export function calculateTrendDirection(delta: number | null): MetricTrendDirection {
    if (delta == null || !Number.isFinite(delta)) return "flat";
    if (Math.abs(delta) < 1e-9) return "flat";
    return delta > 0 ? "up" : "down";
}

export function calculateTrendSentiment(
    direction: MetricTrendDirection,
    target: MetricTargetConfig | null
): MetricTrendSentiment {
    if (direction === "flat") return "neutral";
    const higherIsBetter =
        target?.direction === "higher_is_better" ||
        target?.kind === "rate_min" ||
        target?.kind === "count_min";
    const lowerIsBetter =
        target?.direction === "lower_is_better" ||
        target?.kind === "rate_max" ||
        target?.kind === "count_max" ||
        target?.kind === "duration_max_hours";

    if (higherIsBetter) return direction === "up" ? "good" : "bad";
    if (lowerIsBetter) return direction === "down" ? "good" : "bad";
    return "neutral";
}

export function comparePeriodOverPeriod(params: {
    current: MetricEvaluationResult | MetricPlatformSnapshotRow;
    previous: MetricEvaluationResult | MetricPlatformSnapshotRow | null;
    target?: MetricTargetConfig | null;
}): MetricTrendComparison {
    const currentVal = extractValue(params.current);
    const previousVal = params.previous ? extractValue(params.previous) : null;
    const deltaValue = calculateDeltaValue(currentVal, previousVal);
    const deltaPercent = calculateDeltaPercent(currentVal, previousVal);
    const direction = calculateTrendDirection(deltaValue);
    const sentiment = calculateTrendSentiment(direction, params.target ?? null);

    return {
        current: params.current,
        previous: params.previous,
        deltaValue,
        deltaPercent,
        direction,
        sentiment,
    };
}

export function snapshotToTrendPoint(row: MetricPlatformSnapshotRow): { x: string; y: number | null } {
    return { x: row.computed_at, y: row.value };
}

export function buildSparklinePoints(rows: MetricPlatformSnapshotRow[]): number[] {
    return rows.map((r) => r.value).filter((v): v is number => v != null && Number.isFinite(v));
}

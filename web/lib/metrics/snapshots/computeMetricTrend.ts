import type { MetricFormat } from "@/lib/metrics/types";
import type { MetricSnapshotRow } from "@/lib/metrics/snapshots/types";

export type MetricTrendDirection = "up" | "down" | "flat";

export type MetricTrendPoint = {
    value: number | null;
    computedAt: string;
};

export type MetricTrendSummary = {
    latest: MetricTrendPoint | null;
    prior: MetricTrendPoint | null;
    delta: number | null;
    deltaPercent: number | null;
    direction: MetricTrendDirection;
    /** Normalized 0–1 Y coordinates for sparkline (oldest → newest). */
    sparklineY: number[];
    trendLabel: string;
    hasTrend: boolean;
};

function directionFromDelta(delta: number | null): MetricTrendDirection {
    if (delta == null || !Number.isFinite(delta) || Math.abs(delta) < 1e-9) return "flat";
    return delta > 0 ? "up" : "down";
}

/** Normalize numeric series to 0–1 for sparkline rendering (server-side only). */
export function normalizeSparklineY(values: (number | null)[]): number[] {
    const nums = values.filter((v): v is number => v != null && Number.isFinite(v));
    if (nums.length <= 1) {
        return values.map((v) => (v != null && Number.isFinite(v) ? 0.5 : 0));
    }
    const min = Math.min(...nums);
    const max = Math.max(...nums);
    const span = max - min;
    if (span <= 1e-9) return values.map(() => 0.5);
    return values.map((v) => {
        if (v == null || !Number.isFinite(v)) return 0;
        return (v - min) / span;
    });
}

function formatDeltaLabel(format: MetricFormat, delta: number | null, direction: MetricTrendDirection): string {
    if (delta == null || !Number.isFinite(delta) || direction === "flat") {
        return "Flat vs previous snapshot";
    }

    const abs = Math.abs(delta);
    if (format === "percent") {
        const pct = abs * 100;
        const sign = direction === "up" ? "+" : "−";
        return `${sign}${pct.toFixed(1)} pts vs previous snapshot`;
    }
    if (format === "duration") {
        const sign = direction === "up" ? "+" : "−";
        return `${sign}${abs.toFixed(1)}h vs previous snapshot`;
    }
    if (format === "count") {
        const sign = direction === "up" ? "+" : "−";
        const rounded = Number.isInteger(abs) ? String(Math.round(abs)) : abs.toFixed(1);
        return `${sign}${rounded} vs previous snapshot`;
    }

    const sign = direction === "up" ? "+" : "−";
    return `${sign}${abs.toFixed(2)} vs previous snapshot`;
}

/** Compute trend summary from snapshot rows ordered newest-first. */
export function computeMetricTrendFromSnapshots(
    rows: readonly MetricSnapshotRow[],
    format: MetricFormat
): MetricTrendSummary {
    const points: MetricTrendPoint[] = rows.map((r) => ({
        value: r.value_numeric,
        computedAt: r.computed_at,
    }));

    const latest = points[0] ?? null;
    const prior = points[1] ?? null;

    let delta: number | null = null;
    let deltaPercent: number | null = null;

    if (
        latest?.value != null &&
        prior?.value != null &&
        Number.isFinite(latest.value) &&
        Number.isFinite(prior.value)
    ) {
        delta = latest.value - prior.value;
        if (prior.value !== 0) {
            deltaPercent = delta / Math.abs(prior.value);
        }
    }

    const direction = directionFromDelta(delta);
    const chronological = [...points].reverse();
    const sparklineY = normalizeSparklineY(chronological.map((p) => p.value));
    const hasTrend = prior != null && latest != null;

    return {
        latest,
        prior,
        delta,
        deltaPercent,
        direction,
        sparklineY,
        trendLabel: hasTrend ? formatDeltaLabel(format, delta, direction) : "No trend yet",
        hasTrend,
    };
}

import { describe, expect, it } from "vitest";
import {
    computeMetricTrendFromSnapshots,
    normalizeSparklineY,
} from "@/lib/metrics/snapshots/computeMetricTrend";
import type { MetricSnapshotRow } from "@/lib/metrics/snapshots/types";

function row(value: number | null, at: string): MetricSnapshotRow {
    return {
        id: "1",
        org_id: "o",
        metric_key: "comms.delivery_rate",
        window_key: "rolling_30d",
        scope_type: "org",
        scope_id: null,
        dimension_key: null,
        dimension_value: null,
        value_numeric: value,
        value_json: {},
        computed_at: at,
        created_at: at,
    };
}

describe("computeMetricTrend", () => {
    it("normalizes sparkline Y values server-side", () => {
        expect(normalizeSparklineY([10, 20, 30])).toEqual([0, 0.5, 1]);
        expect(normalizeSparklineY([5, 5, 5])).toEqual([0.5, 0.5, 0.5]);
    });

    it("computes percent delta label vs prior snapshot", () => {
        const trend = computeMetricTrendFromSnapshots(
            [row(0.55, "2026-06-23T00:00:00Z"), row(0.5, "2026-06-22T00:00:00Z")],
            "percent"
        );
        expect(trend.hasTrend).toBe(true);
        expect(trend.direction).toBe("up");
        expect(trend.trendLabel).toContain("+5.0 pts");
    });

    it("returns no trend yet with single snapshot", () => {
        const trend = computeMetricTrendFromSnapshots([row(3, "2026-06-23T00:00:00Z")], "count");
        expect(trend.hasTrend).toBe(false);
        expect(trend.trendLabel).toBe("No trend yet");
    });

    it("formats count down trend", () => {
        const trend = computeMetricTrendFromSnapshots(
            [row(3, "2026-06-23T00:00:00Z"), row(8, "2026-06-22T00:00:00Z")],
            "count"
        );
        expect(trend.direction).toBe("down");
        expect(trend.trendLabel).toContain("−5");
    });
});

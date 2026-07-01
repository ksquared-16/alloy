import { describe, expect, it } from "vitest";
import { validateMetricDefinitionCreate, validateMetricDefinitionUpdate } from "@/lib/metrics/platform/metricDefinitionSchema";
import { validateMetricVisualizationCreate } from "@/lib/metrics/platform/metricVisualizationSchema";
import { validateMetricPlacementCreate } from "@/lib/metrics/platform/metricPlacementSchema";
import { validateMetricRollupCreate } from "@/lib/metrics/platform/metricRollupSchema";
import { rejectUnknownConfigVersion, CONFIG_VERSION } from "@/lib/metrics/platform/schemas";
import {
    assertKnownSourceKey,
    getMetricSourceAdapter,
    validateSourceAggregation,
} from "@/lib/metrics/platform/metricSourceRegistry";
import { evaluatePlatformMetricHealth } from "@/lib/metrics/platform/metricHealth";
import {
    calculateDeltaPercent,
    calculateDeltaValue,
    calculateTrendDirection,
    calculateTrendSentiment,
    comparePeriodOverPeriod,
} from "@/lib/metrics/platform/metricTrends";
import { resolveMetricPeriodBounds } from "@/lib/metrics/platform/metricPeriod";
import { isAnalyticsV2MetricPlatformEnabledServer } from "@/lib/metrics/platform/featureFlag";
import { rollupValues } from "@/lib/metrics/platform/metricRollupsTestHelpers";

describe("metric definition schema", () => {
    it("accepts valid config", () => {
        const input = validateMetricDefinitionCreate({
            key: "tour_conversion_rate",
            label: "Tour Conversion %",
            source_type: "oip_adapter",
            source_key: "enrollment.tour_conversion_rate",
            aggregation: "rate",
        });
        expect(input.key).toBe("tour_conversion_rate");
        expect(input.version).toBe(1);
    });

    it("rejects unknown version in period config", () => {
        expect(() =>
            validateMetricDefinitionCreate({
                key: "test_metric",
                label: "Test",
                source_type: "oip_adapter",
                source_key: "enrollment.tour_conversion_rate",
                aggregation: "rate",
                default_period_config: { version: 99, kind: "rolling", days: 30 },
            })
        ).toThrow();
    });

    it("rejects unknown keys via strict schema", () => {
        expect(() =>
            validateMetricDefinitionCreate({
                key: "test_metric",
                label: "Test",
                source_type: "oip_adapter",
                source_key: "enrollment.tour_conversion_rate",
                aggregation: "rate",
                bogus: true,
            })
        ).toThrow();
    });

    it("accepts partial update", () => {
        const update = validateMetricDefinitionUpdate({ label: "Updated label" });
        expect(update.label).toBe("Updated label");
    });
});

describe("visualization and placement schema", () => {
    it("validates visualization config", () => {
        const viz = validateMetricVisualizationCreate({
            metric_definition_id: "00000000-0000-4000-8000-000000000001",
            key: "tour_kpi",
            label: "Tour KPI",
            visualization_type: "kpi_card",
        });
        expect(viz.visualization_type).toBe("kpi_card");
    });

    it("validates placement config", () => {
        const placement = validateMetricPlacementCreate({
            visualization_id: "00000000-0000-4000-8000-000000000002",
            surface: "operational_intelligence",
            placement_zone: "overview",
        });
        expect(placement.surface).toBe("operational_intelligence");
    });
});

describe("rollup schema", () => {
    it("validates rollup config", () => {
        const rollup = validateMetricRollupCreate({
            key: "enrollment_health",
            label: "Enrollment Health",
            rollup_type: "health_score",
            child_metric_config: {
                version: 1,
                metrics: [{ metricDefinitionId: "00000000-0000-4000-8000-000000000003" }],
            },
        });
        expect(rollup.rollup_type).toBe("health_score");
    });
});

describe("config version guard", () => {
    it("rejects unknown config versions", () => {
        expect(() => rejectUnknownConfigVersion({ version: 2 }, "filter_config")).toThrow(/not supported/);
    });

    it("accepts version 1", () => {
        expect(() => rejectUnknownConfigVersion({ version: CONFIG_VERSION }, "filter_config")).not.toThrow();
    });
});

describe("source adapter registry", () => {
    it("rejects unknown source keys", () => {
        expect(() => assertKnownSourceKey("bogus.source")).toThrow(/Unknown metric source key/);
    });

    it("validates aggregation for available adapter", () => {
        expect(() => validateSourceAggregation("enrollment.tour_conversion_rate", "rate")).not.toThrow();
    });

    it("rejects aggregation not supported by adapter", () => {
        expect(() => validateSourceAggregation("enrollment.tour_conversion_rate", "median")).toThrow(/not supported/);
    });

    it("marks available enrollment count adapters", () => {
        const adapter = getMetricSourceAdapter("enrollment.lead_count");
        expect(adapter?.status).toBe("available");
    });
});

describe("metric health evaluation", () => {
    it("produces healthy for rate above threshold", () => {
        const state = evaluatePlatformMetricHealth({
            value: 0.7,
            target: { version: 1, kind: "rate_min", targetMinRate: 0.65 },
            thresholds: { version: 1, healthyMinRate: 0.65, warningMinRate: 0.5 },
        });
        expect(state).toBe("healthy");
    });

    it("produces warning for rate between thresholds", () => {
        const state = evaluatePlatformMetricHealth({
            value: 0.55,
            target: { version: 1, kind: "rate_min", targetMinRate: 0.65 },
            thresholds: { version: 1, healthyMinRate: 0.65, warningMinRate: 0.5 },
        });
        expect(state).toBe("warning");
    });

    it("produces critical for rate below warning", () => {
        const state = evaluatePlatformMetricHealth({
            value: 0.3,
            target: { version: 1, kind: "rate_min", targetMinRate: 0.65 },
            thresholds: { version: 1, healthyMinRate: 0.65, warningMinRate: 0.5 },
        });
        expect(state).toBe("critical");
    });

    it("produces healthy for count under max", () => {
        const state = evaluatePlatformMetricHealth({
            value: 5,
            target: { version: 1, kind: "count_max", targetMaxCount: 10 },
            thresholds: { version: 1, healthyMaxCount: 10, warningMaxCount: 25 },
        });
        expect(state).toBe("healthy");
    });
});

describe("metric trends", () => {
    it("calculates delta value and percent", () => {
        expect(calculateDeltaValue(0.7, 0.5)).toBeCloseTo(0.2);
        expect(calculateDeltaPercent(0.7, 0.5)).toBeCloseTo(40);
    });

    it("calculates trend direction", () => {
        expect(calculateTrendDirection(0.1)).toBe("up");
        expect(calculateTrendDirection(-0.1)).toBe("down");
        expect(calculateTrendDirection(0)).toBe("flat");
    });

    it("calculates sentiment based on target direction", () => {
        expect(
            calculateTrendSentiment("up", { version: 1, kind: "rate_min", direction: "higher_is_better" })
        ).toBe("good");
        expect(
            calculateTrendSentiment("up", { version: 1, kind: "count_max", direction: "lower_is_better" })
        ).toBe("bad");
    });

    it("compares period over period", () => {
        const comparison = comparePeriodOverPeriod({
            current: {
                metricDefinitionId: "id",
                key: "test",
                label: "Test",
                unit: "percent",
                value: 0.7,
                numeratorValue: null,
                denominatorValue: null,
                formattedValue: "70%",
                healthState: "healthy",
                periodStart: "2026-06-01T00:00:00.000Z",
                periodEnd: "2026-06-30T00:00:00.000Z",
                computedAt: "2026-06-30T00:00:00.000Z",
            },
            previous: {
                metricDefinitionId: "id",
                key: "test",
                label: "Test",
                unit: "percent",
                value: 0.5,
                numeratorValue: null,
                denominatorValue: null,
                formattedValue: "50%",
                healthState: "warning",
                periodStart: "2026-05-01T00:00:00.000Z",
                periodEnd: "2026-05-31T00:00:00.000Z",
                computedAt: "2026-05-31T00:00:00.000Z",
            },
            target: { version: 1, kind: "rate_min", direction: "higher_is_better" },
        });
        expect(comparison.deltaValue).toBeCloseTo(0.2);
        expect(comparison.direction).toBe("up");
        expect(comparison.sentiment).toBe("good");
    });
});

describe("metric period", () => {
    it("resolves rolling 30 day bounds", () => {
        const now = new Date("2026-06-24T12:00:00.000Z");
        const bounds = resolveMetricPeriodBounds({ version: 1, kind: "rolling", days: 30 }, now);
        expect(bounds.periodEnd.toISOString()).toBe(now.toISOString());
        expect(bounds.comparisonStart).not.toBeNull();
    });
});

describe("rollup calculation", () => {
    it("computes sum rollup", () => {
        expect(rollupValues("sum", [1, 2, 3])).toBe(6);
    });

    it("computes avg rollup", () => {
        expect(rollupValues("avg", [2, 4])).toBe(3);
    });

    it("computes weighted avg rollup", () => {
        expect(rollupValues("weighted_avg", [0.8, 0.6], [2, 1])).toBeCloseTo(0.733, 2);
    });
});

describe("feature flag", () => {
    it("defaults to on during active development", () => {
        const prev = process.env.ANALYTICS_V2_METRIC_PLATFORM_ENABLED;
        delete process.env.ANALYTICS_V2_METRIC_PLATFORM_ENABLED;
        expect(isAnalyticsV2MetricPlatformEnabledServer()).toBe(true);
        if (prev !== undefined) process.env.ANALYTICS_V2_METRIC_PLATFORM_ENABLED = prev;
    });

    it("can opt out explicitly", () => {
        const prev = process.env.ANALYTICS_V2_METRIC_PLATFORM_ENABLED;
        process.env.ANALYTICS_V2_METRIC_PLATFORM_ENABLED = "0";
        expect(isAnalyticsV2MetricPlatformEnabledServer()).toBe(false);
        if (prev !== undefined) process.env.ANALYTICS_V2_METRIC_PLATFORM_ENABLED = prev;
        else delete process.env.ANALYTICS_V2_METRIC_PLATFORM_ENABLED;
    });
});

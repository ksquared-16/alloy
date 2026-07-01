/** @vitest-environment jsdom */

import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

import { MetricVisualRenderer } from "@/components/admin/metrics/MetricVisualRenderer";
import { MetricHealthCard } from "@/components/admin/metrics/MetricHealthCard";
import { MetricBreakdownCard } from "@/components/admin/metrics/MetricBreakdownCard";
import type { MetricEvaluationResult, MetricVisualizationType, ResolvedMetricPlacement } from "@/lib/metrics/platform/types";

function placement(visualizationType: MetricVisualizationType): ResolvedMetricPlacement {
    return {
        id: "pl-1",
        visualization: {
            id: "viz-1",
            visualization_type: visualizationType,
            label: "Tour conversion",
            style_config: { accent: "amber", fill: "soft" },
            display_config: {},
        },
        definition: { id: "def-1", key: "tour_conversion", label: "Tour conversion", unit: "percent", precision: 0 },
    } as unknown as ResolvedMetricPlacement;
}

function evaluation(overrides: Partial<MetricEvaluationResult> = {}): MetricEvaluationResult {
    return {
        metricDefinitionId: "def-1",
        key: "tour_conversion",
        label: "Tour conversion",
        unit: "percent",
        value: 0.38,
        numeratorValue: null,
        denominatorValue: null,
        formattedValue: "38%",
        healthState: "warning",
        periodStart: "2026-06-01",
        periodEnd: "2026-06-28",
        computedAt: "2026-06-28",
        ...overrides,
    };
}

describe("MetricVisualRenderer dispatch", () => {
    const cases: Array<[MetricVisualizationType, string]> = [
        ["kpi_card", "kpi_card"],
        ["scorecard", "scorecard"],
        ["trend_card", "trend_card"],
        ["comparison", "comparison"],
        ["chip", "chip"],
        ["gauge", "gauge"],
        ["bar_chart", "bar_chart"],
    ];

    it.each(cases)("renders %s as data-metric-visual=%s", (type, expected) => {
        const html = renderToStaticMarkup(
            <MetricVisualRenderer placement={placement(type)} evaluation={evaluation()} />,
        );
        expect(html).toContain(`data-metric-visual="${expected}"`);
    });

    it("renders the resolved value and never recomputes it", () => {
        const html = renderToStaticMarkup(
            <MetricVisualRenderer placement={placement("kpi_card")} evaluation={evaluation({ formattedValue: "42%" })} />,
        );
        expect(html).toContain("42%");
    });

    it("routes gauge to the Health renderer and bar_chart to the Breakdown renderer", () => {
        const gauge = renderToStaticMarkup(
            <MetricVisualRenderer placement={placement("gauge")} evaluation={evaluation()} />,
        );
        // Gauge fill derives from a percent value (0.38 → 38), presentation only.
        expect(gauge).toContain('data-metric-gauge-fill="38"');

        const bar = renderToStaticMarkup(
            <MetricVisualRenderer
                placement={placement("bar_chart")}
                evaluation={evaluation()}
                breakdownSegments={[{ label: "Maple", value: 4, tone: "healthy" }]}
            />,
        );
        expect(bar).toContain('data-metric-breakdown-segments="1"');
    });

    it("falls back to a KPI card for unmapped visualization types", () => {
        const html = renderToStaticMarkup(
            <MetricVisualRenderer placement={placement("table")} evaluation={evaluation()} />,
        );
        expect(html).toContain('data-metric-visual="kpi_card"');
    });

    it("defaults to standard density and forwards compact density to the card", () => {
        const standard = renderToStaticMarkup(
            <MetricVisualRenderer placement={placement("kpi_card")} evaluation={evaluation()} />,
        );
        expect(standard).toContain('data-metric-density="standard"');

        const compact = renderToStaticMarkup(
            <MetricVisualRenderer placement={placement("kpi_card")} evaluation={evaluation()} density="compact" />,
        );
        expect(compact).toContain('data-metric-density="compact"');
    });
});

describe("MetricHealthCard", () => {
    it("draws the gauge ring from an explicit score and shows the value", () => {
        const html = renderToStaticMarkup(<MetricHealthCard label="Org health" value="84 / 100" score={84} status="healthy" />);
        expect(html).toContain('data-metric-visual="gauge"');
        expect(html).toContain('data-metric-gauge-fill="84"');
        expect(html).toContain("84 / 100");
    });

    it("falls back to a health-band fill when no score is given (no recompute)", () => {
        const html = renderToStaticMarkup(<MetricHealthCard label="Org health" value="—" status="critical" />);
        expect(html).toContain('data-metric-gauge-fill="25"');
    });

    it("shrinks the gauge ring in compact (header) density", () => {
        const standard = renderToStaticMarkup(<MetricHealthCard label="Org health" value="84" score={84} status="healthy" />);
        expect(standard).toContain('width="64"');
        const compact = renderToStaticMarkup(
            <MetricHealthCard label="Org health" value="84" score={84} status="healthy" density="compact" />,
        );
        expect(compact).toContain('width="44"');
        expect(compact).toContain('data-metric-density="compact"');
    });
});

describe("MetricBreakdownCard", () => {
    it("renders one bar per segment with display values", () => {
        const html = renderToStaticMarkup(
            <MetricBreakdownCard
                label="Response by site"
                status="warning"
                segments={[
                    { label: "Maple", value: 1.4, formattedValue: "1.4h", tone: "healthy" },
                    { label: "Downtown", value: 6.1, formattedValue: "6.1h", tone: "critical" },
                ]}
            />,
        );
        expect(html).toContain('data-metric-breakdown-segments="2"');
        expect(html).toContain("1.4h");
        expect(html).toContain("6.1h");
    });

    it("renders a graceful empty state when there are no segments", () => {
        const html = renderToStaticMarkup(<MetricBreakdownCard label="Response by site" segments={[]} />);
        expect(html).toContain("No breakdown available");
    });
});

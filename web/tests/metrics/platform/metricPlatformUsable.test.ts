import { describe, expect, it } from "vitest";
import { resolveMetricSurfaceKey } from "@/lib/metrics/platform/resolveMetricSurfaceKey";
import { computeLeadCount, computeTourCompletedCount } from "@/lib/metrics/resolvers/eventWindowMetrics";
import { validateSourceAggregation, getMetricSourceAdapter } from "@/lib/metrics/platform/metricSourceRegistry";
import { placementRenderToEvaluation } from "@/lib/metrics/platform/renderMetricPlacements";
import type { MetricPlacementRenderItem } from "@/lib/metrics/platform/renderMetricPlacements";

describe("resolveMetricSurfaceKey", () => {
    it("prefers process key", () => {
        expect(resolveMetricSurfaceKey({ processKey: "enrollment", laneKey: "enrollment_pipeline" })).toBe("enrollment");
    });

    it("maps enrollment lane prefixes", () => {
        expect(resolveMetricSurfaceKey({ laneKey: "enrollment_pipeline" })).toBe("enrollment");
    });

    it("falls back to default", () => {
        expect(resolveMetricSurfaceKey({ laneKey: "priced_followup" })).toBe("default");
    });
});

describe("enrollment count adapters", () => {
    it("counts leads from opportunity rows", () => {
        expect(
            computeLeadCount([
                { id: "1", created_at: "2026-06-01T00:00:00.000Z" },
                { id: "2", created_at: "2026-06-02T00:00:00.000Z" },
            ])
        ).toBe(2);
    });

    it("counts completed tours from booking rows", () => {
        expect(
            computeTourCompletedCount([
                { status_key: "completed" },
                { status_key: "scheduled" },
                { status_key: "completed" },
            ] as never[])
        ).toBe(2);
    });

    it("registers lead_count as available", () => {
        const adapter = getMetricSourceAdapter("enrollment.lead_count");
        expect(adapter?.status).toBe("available");
        expect(() => validateSourceAggregation("enrollment.lead_count", "count")).not.toThrow();
    });
});

describe("snapshot-first render mapping", () => {
    it("maps placement render item to evaluation", () => {
        const item = {
            id: "p1",
            formattedValue: "72%",
            healthState: "healthy",
            snapshot: { value: 0.72 },
            definition: { id: "d1", key: "tour_conversion_rate", label: "Tour Conversion %", unit: "percent" },
            visualization: { label: "Tour Conversion KPI" },
        } as unknown as MetricPlacementRenderItem;

        const evaluation = placementRenderToEvaluation(item);
        expect(evaluation?.formattedValue).toBe("72%");
        expect(evaluation?.healthState).toBe("healthy");
        expect(evaluation?.value).toBe(0.72);
    });
});

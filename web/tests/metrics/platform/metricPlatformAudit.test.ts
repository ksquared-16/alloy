import { describe, expect, it, vi } from "vitest";
import { validateSourceAggregation } from "@/lib/metrics/platform/metricSourceRegistry";
import { evaluateMetricDefinition } from "@/lib/metrics/platform/metricEvaluator";
import type { MetricDefinitionRow } from "@/lib/metrics/platform/types";
import { computeTourConversionRate } from "@/lib/metrics/resolvers/eventWindowMetrics";

describe("disabled adapter safety", () => {
    it("rejects disabled source at validation time", () => {
        expect(() => validateSourceAggregation("enrollment.pipeline_value", "sum")).toThrow(/disabled/);
    });

    it("evaluator throws for disabled adapter (no fake values)", async () => {
        const def = {
            id: "def-1",
            org_id: null,
            key: "pipeline_value",
            label: "Pipeline Value",
            description: "",
            category: "enrollment",
            entity_scope: "org",
            source_type: "oip_adapter",
            source_key: "enrollment.pipeline_value",
            aggregation: "sum",
            numerator_config: null,
            denominator_config: null,
            filter_config: { version: 1 as const },
            dimension_config: { version: 1 as const },
            default_period_config: { version: 1 as const, kind: "rolling" as const, days: 30 },
            unit: "count" as const,
            precision: 0,
            is_kpi: false,
            target_config: null,
            threshold_config: null,
            status: "active" as const,
            version: 1,
            created_at: "",
            updated_at: "",
            created_by: null,
            updated_by: null,
        } satisfies MetricDefinitionRow;

        await expect(
            evaluateMetricDefinition({
                supabase: {} as never,
                definition: def,
                ctx: { orgId: "org-1" },
            })
        ).rejects.toThrow(/disabled/);
    });
});

describe("rate zero denominator", () => {
    it("returns null rate when scheduled is zero", () => {
        const result = computeTourConversionRate([]);
        expect(result.scheduled).toBe(0);
        expect(result.rate).toBeNull();
    });
});

describe("fetchOiV2Placements grouping", () => {
    it("groups placements by zone from a single response", async () => {
        const { fetchOiV2Placements } = await import("@/lib/metrics/platform/fetchMetricPlatform");
        const originalFetch = globalThis.fetch;
        globalThis.fetch = vi.fn(async () => ({
            ok: true,
            json: async () => ({
                items: [
                    { id: "p1", placement_zone: "overview" },
                    { id: "p2", placement_zone: "health" },
                ],
            }),
        })) as unknown as typeof fetch;

        const zones = await fetchOiV2Placements();
        expect(zones.overview).toHaveLength(1);
        expect(zones.health).toHaveLength(1);
        expect(globalThis.fetch).toHaveBeenCalledTimes(1);

        globalThis.fetch = originalFetch;
    });
});

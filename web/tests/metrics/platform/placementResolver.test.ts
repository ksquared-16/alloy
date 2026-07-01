import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { resolvePlacementsForSurface } from "@/lib/metrics/platform/placementResolver";

function mockSupabase(placements: unknown[], visualizations: unknown[], definitions: unknown[]) {
    const from = vi.fn((table: string) => {
        const chain: Record<string, unknown> = {};
        const self = () => chain;
        chain.select = vi.fn(self);
        chain.eq = vi.fn(self);
        chain.in = vi.fn(self);
        chain.or = vi.fn(self);
        chain.order = vi.fn(self);
        chain.limit = vi.fn(self);
        chain.is = vi.fn(self);
        chain.maybeSingle = vi.fn(self);

        if (table === "metric_placements") {
            chain.then = undefined;
            Object.assign(chain, {
                then(onFulfilled: (v: { data: unknown[]; error: null }) => unknown) {
                    return Promise.resolve(onFulfilled({ data: placements, error: null }));
                },
            });
        }
        if (table === "metric_visualizations") {
            Object.assign(chain, {
                then(onFulfilled: (v: { data: unknown[]; error: null }) => unknown) {
                    return Promise.resolve(onFulfilled({ data: visualizations, error: null }));
                },
            });
        }
        if (table === "metric_definitions") {
            Object.assign(chain, {
                then(onFulfilled: (v: { data: unknown[]; error: null }) => unknown) {
                    return Promise.resolve(onFulfilled({ data: definitions, error: null }));
                },
            });
        }
        return chain;
    });
    return { from } as unknown as import("@supabase/supabase-js").SupabaseClient;
}

describe("placement resolver", () => {
    it("filters by surface and org scope", async () => {
        const vizId = "viz-1";
        const defId = "def-1";
        const supabase = mockSupabase(
            [
                {
                    id: "p1",
                    org_id: "org-1",
                    visualization_id: vizId,
                    surface: "operational_intelligence",
                    surface_key: "default",
                    placement_zone: "overview",
                    context_config: { version: 1 },
                    visibility_config: { version: 1, visible: true },
                    sort_order: 0,
                    status: "active",
                    version: 1,
                    created_at: "",
                    updated_at: "",
                },
            ],
            [
                {
                    id: vizId,
                    org_id: null,
                    metric_definition_id: defId,
                    key: "tour_kpi",
                    label: "Tour KPI",
                    visualization_type: "kpi_card",
                    style_config: { version: 1 },
                    display_config: { version: 1 },
                    version: 1,
                    status: "active",
                    created_at: "",
                    updated_at: "",
                },
            ],
            [
                {
                    id: defId,
                    org_id: null,
                    key: "tour_conversion_rate",
                    label: "Tour Conversion %",
                    description: "",
                    category: "enrollment",
                    entity_scope: "org",
                    source_type: "oip_adapter",
                    source_key: "enrollment.tour_conversion_rate",
                    aggregation: "rate",
                    numerator_config: null,
                    denominator_config: null,
                    filter_config: { version: 1 },
                    dimension_config: { version: 1 },
                    default_period_config: { version: 1, kind: "rolling", days: 30 },
                    unit: "percent",
                    precision: 1,
                    is_kpi: true,
                    target_config: null,
                    threshold_config: null,
                    status: "active",
                    version: 1,
                    created_at: "",
                    updated_at: "",
                    created_by: null,
                    updated_by: null,
                },
            ]
        );

        const items = await resolvePlacementsForSurface({
            supabase,
            orgId: "org-1",
            surface: "operational_intelligence",
            surfaceKey: "default",
            placementZone: "overview",
        });

        expect(items).toHaveLength(1);
        expect(items[0]?.definition.key).toBe("tour_conversion_rate");
        expect(items[0]?.visualization.visualization_type).toBe("kpi_card");
    });

    it("respects visibility hidden", async () => {
        const supabase = mockSupabase(
            [
                {
                    id: "p1",
                    org_id: "org-1",
                    visualization_id: "viz-1",
                    surface: "operational_intelligence",
                    surface_key: "default",
                    placement_zone: "overview",
                    context_config: { version: 1 },
                    visibility_config: { version: 1, visible: false },
                    sort_order: 0,
                    status: "active",
                    version: 1,
                    created_at: "",
                    updated_at: "",
                },
            ],
            [
                {
                    id: "viz-1",
                    org_id: null,
                    metric_definition_id: "def-1",
                    key: "hidden",
                    label: "Hidden",
                    visualization_type: "kpi_card",
                    style_config: { version: 1 },
                    display_config: { version: 1 },
                    version: 1,
                    status: "active",
                    created_at: "",
                    updated_at: "",
                },
            ],
            [
                {
                    id: "def-1",
                    org_id: null,
                    key: "test",
                    label: "Test",
                    description: "",
                    category: "general",
                    entity_scope: "org",
                    source_type: "oip_adapter",
                    source_key: "enrollment.tour_conversion_rate",
                    aggregation: "rate",
                    numerator_config: null,
                    denominator_config: null,
                    filter_config: { version: 1 },
                    dimension_config: { version: 1 },
                    default_period_config: { version: 1, kind: "rolling", days: 30 },
                    unit: "percent",
                    precision: 0,
                    is_kpi: false,
                    target_config: null,
                    threshold_config: null,
                    status: "active",
                    version: 1,
                    created_at: "",
                    updated_at: "",
                    created_by: null,
                    updated_by: null,
                },
            ]
        );

        const items = await resolvePlacementsForSurface({
            supabase,
            orgId: "org-1",
            surface: "operational_intelligence",
        });
        expect(items).toHaveLength(0);
    });
});

describe("BOS metric read", () => {
    it("lists readable metrics from definitions", async () => {
        const { listBosReadableMetrics } = await import("@/lib/metrics/platform/bosMetricRead");
        const resolved = {
            data: [
                {
                    key: "tour_conversion_rate",
                    label: "Tour Conversion %",
                    description: "Test",
                    is_kpi: true,
                },
            ],
            error: null,
        };
        const afterOrder = {
            eq: vi.fn().mockResolvedValue(resolved),
        };
        const chain = {
            select: vi.fn().mockReturnThis(),
            or: vi.fn().mockReturnThis(),
            order: vi.fn().mockReturnValue(afterOrder),
        };
        const supabase = {
            from: vi.fn(() => chain),
        } as unknown as import("@supabase/supabase-js").SupabaseClient;

        const items = await listBosReadableMetrics(supabase, "org-1");
        expect(items).toHaveLength(1);
        expect(items[0]?.key).toBe("tour_conversion_rate");
    });
});

describe("feature flag V1 fallback", () => {
    it("defaults to on during active development", async () => {
        const { isAnalyticsV2MetricPlatformEnabledClient } = await import("@/lib/metrics/platform/featureFlag");
        const prev = process.env.NEXT_PUBLIC_ANALYTICS_V2_METRIC_PLATFORM_ENABLED;
        delete process.env.NEXT_PUBLIC_ANALYTICS_V2_METRIC_PLATFORM_ENABLED;
        expect(isAnalyticsV2MetricPlatformEnabledClient()).toBe(true);
        if (prev !== undefined) process.env.NEXT_PUBLIC_ANALYTICS_V2_METRIC_PLATFORM_ENABLED = prev;
    });

    it("can opt out explicitly for V1-only path", async () => {
        const { isAnalyticsV2MetricPlatformEnabledClient } = await import("@/lib/metrics/platform/featureFlag");
        const prev = process.env.NEXT_PUBLIC_ANALYTICS_V2_METRIC_PLATFORM_ENABLED;
        process.env.NEXT_PUBLIC_ANALYTICS_V2_METRIC_PLATFORM_ENABLED = "0";
        expect(isAnalyticsV2MetricPlatformEnabledClient()).toBe(false);
        if (prev !== undefined) process.env.NEXT_PUBLIC_ANALYTICS_V2_METRIC_PLATFORM_ENABLED = prev;
        else delete process.env.NEXT_PUBLIC_ANALYTICS_V2_METRIC_PLATFORM_ENABLED;
    });
});

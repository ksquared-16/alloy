import { describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";

import {
    HEADER_ZONE_BY_SURFACE,
    loadHeaderSurfaceViews,
    type HeaderPlacementView,
} from "@/lib/metrics/platform/headerSurfacePersistence";
import { findOperationalCalculation } from "@/lib/analytics/calculations/registry";
import type { ResolvedMetricMap } from "@/lib/metrics/fetchResolvedMetrics";
import {
    fallbackWorkspaceHeaderCardVms,
    refineWorkspaceHeaderCardVms,
    seedWorkspaceHeaderCalculations,
    workspaceHeaderCalculationKeys,
    workspaceHeaderCardVmsFromViews,
    type WorkspaceHeaderCalculationCardVm,
} from "@/lib/presentation/runtime/workspaceHeaderCards";

/* ------------------------------------------------------------------------------------ */
/* Published-surface fixture: metric_placements + joined visualizations/definitions      */
/* exactly as /settings/surfaces publishes them (surface="workspace_header",             */
/* surface_key="default", placement_zone="primary_metrics").                             */
/* ------------------------------------------------------------------------------------ */

type Row = Record<string, unknown>;

/** Minimal thenable supabase query stub covering the placement resolver's chains. */
function fakeSupabase(tables: Record<string, Row[]>): SupabaseClient {
    return {
        from(table: string) {
            let rows = [...(tables[table] ?? [])];
            const builder: Record<string, unknown> = {
                select: () => builder,
                or: () => builder,
                eq: (col: string, val: unknown) => {
                    rows = rows.filter((r) => r[col] === val);
                    return builder;
                },
                in: (col: string, vals: unknown[]) => {
                    rows = rows.filter((r) => vals.includes(r[col]));
                    return builder;
                },
                order: (col: string) => {
                    rows = [...rows].sort((a, b) => Number(a[col] ?? 0) - Number(b[col] ?? 0));
                    return builder;
                },
                then: (resolve: (v: unknown) => unknown) =>
                    Promise.resolve({ data: rows, error: null }).then(resolve),
            };
            return builder;
        },
    } as unknown as SupabaseClient;
}

const ORG = "org-1";

function def(id: string, sourceKey: string, label: string): Row {
    return { id, org_id: ORG, source_type: "oip_adapter", source_key: sourceKey, label, status: "active" };
}

function viz(id: string, definitionId: string, sourceKey: string, label: string, type = "kpi_card"): Row {
    return { id, org_id: ORG, metric_definition_id: definitionId, key: `wsh.${sourceKey}`, label, visualization_type: type, status: "active" };
}

function placement(
    id: string,
    vizId: string,
    sortOrder: number,
    opts?: { visible?: boolean; status?: string; context?: Row },
): Row {
    return {
        id,
        org_id: ORG,
        visualization_id: vizId,
        surface: "workspace_header",
        surface_key: "default",
        placement_zone: "primary_metrics",
        context_config: opts?.context ?? { version: 1 },
        visibility_config: { version: 1, visible: opts?.visible ?? true },
        sort_order: sortOrder,
        status: opts?.status ?? "active",
    };
}

const PUBLISHED = {
    metric_definitions: [
        def("d-leads", "enrollment.lead_count", "Lead count"),
        def("d-attn", "ops.needs_attention_count", "Needs attention"),
        def("d-overdue", "ops.work_overdue_count", "Overdue work"),
        def("d-tour", "enrollment.tour_conversion_rate", "Tour conversion"),
    ],
    metric_visualizations: [
        viz("v-leads", "d-leads", "enrollment.lead_count", "New families"), // configured title
        viz("v-attn", "d-attn", "ops.needs_attention_count", "Needs attention"),
        viz("v-overdue", "d-overdue", "ops.work_overdue_count", "Overdue work"),
        viz("v-tour", "d-tour", "enrollment.tour_conversion_rate", "Tour conversion", "trend_card"),
    ],
    metric_placements: [
        // Out-of-insert-order sort orders — the strip must follow sort_order, not row order.
        placement("p-attn", "v-attn", 0, { context: { version: 1, accent: "amber", showHealthChip: true } }),
        placement("p-leads", "v-leads", 20),
        placement("p-overdue", "v-overdue", 10),
        // Hidden + visibility-off placements must never reach the strip.
        placement("p-tour-off", "v-tour", 5, { visible: false }),
        placement("p-tour-hidden", "v-tour", 6, { status: "hidden" }),
    ],
};

describe("WS.HEADER_CALCULATIONS — published surface → header card VMs", () => {
    it("loads only active+visible workspace_header/primary_metrics placements, in sort_order", async () => {
        const views = await loadHeaderSurfaceViews(
            fakeSupabase(PUBLISHED),
            ORG,
            "workspace_header",
            HEADER_ZONE_BY_SURFACE.workspace_header,
        );
        expect(views.map((v) => v.sourceKey)).toEqual([
            "ops.needs_attention_count",
            "ops.work_overdue_count",
            "enrollment.lead_count",
        ]);
        // Builder-configured display treatment rides context_config.
        expect(views[0]).toMatchObject({ accent: "amber", showHealthChip: true, label: "Needs attention" });
        // The configured title (persisted as the visualization label) is the view label.
        expect(views[2]?.label).toBe("New families");
    });

    it("maps views to card VMs: order, configured title, values, no-data contract, drill hrefs", async () => {
        const views = await loadHeaderSurfaceViews(
            fakeSupabase(PUBLISHED),
            ORG,
            "workspace_header",
            HEADER_ZONE_BY_SURFACE.workspace_header,
        );
        const values = new Map([
            ["ops.needs_attention_count", { formattedValue: "7", status: "warning" }],
            ["enrollment.lead_count", { formattedValue: "18", status: null }],
            // ops.work_overdue_count intentionally unresolved (no data).
        ]);
        const cards = workspaceHeaderCardVmsFromViews(views, (k) => values.get(k) ?? null);

        expect(cards.map((c) => c.sourceKey)).toEqual([
            "ops.needs_attention_count",
            "ops.work_overdue_count",
            "enrollment.lead_count",
        ]);
        expect(cards[0]).toMatchObject({
            label: "Needs attention",
            formattedValue: "7",
            status: "warning",
            accent: "amber",
            showHealthChip: true,
            vizType: "kpi",
            drillHref: "/workspace/work-unit/needs-attention",
        });
        // A published card with no resolved data STAYS, as "—"/unknown (preview contract).
        expect(cards[1]).toMatchObject({
            sourceKey: "ops.work_overdue_count",
            formattedValue: "—",
            status: "unknown",
            accent: null,
        });
        // Configured title override wins over definition/adapter labels.
        expect(cards[2]).toMatchObject({
            label: "New families",
            formattedValue: "18",
            status: "unknown",
            drillHref: "/workspace/work-unit/enrollment-pipeline",
        });
    });

    it("maps trend_card visualizations to the trend renderer and 'auto' accent to null", () => {
        const views: HeaderPlacementView[] = [
            { id: "t", sourceKey: "enrollment.tour_conversion_rate", vizType: "trend_card", label: "Tour conversion", sortOrder: 0, accent: "auto" },
        ];
        const [card] = workspaceHeaderCardVmsFromViews(views, () => null);
        expect(card).toMatchObject({ vizType: "trend", accent: null });
    });

    it("guards raw source-key labels from legacy rows (display-label fallback chain)", () => {
        const views: HeaderPlacementView[] = [
            { id: "r", sourceKey: "enrollment.lead_count", vizType: "kpi_card", label: "enrollment.lead_count", sortOrder: 0 },
        ];
        const [card] = workspaceHeaderCardVmsFromViews(views, () => null);
        expect(card?.label).toBe("Lead count");
    });
});

describe("WS.HEADER_CALCULATIONS — fallback path (unpublished orgs)", () => {
    it("seeds from the Route VM when the published seed is non-empty (fallback stays out)", () => {
        const seed: WorkspaceHeaderCalculationCardVm[] = [
            {
                sourceKey: "ops.needs_attention_count",
                vizType: "kpi",
                label: "Needs attention",
                accent: null,
                showHealthChip: false,
                sortOrder: 0,
                formattedValue: "7",
                status: "warning",
                drillHref: "/workspace/work-unit/needs-attention",
            },
        ];
        const cards = seedWorkspaceHeaderCalculations(seed);
        expect(cards).toEqual(seed);
        expect(cards).not.toBe(seed); // defensive copy — state mutation safe
    });

    it("falls back to the code-owned default keys ONLY when the seed is null/empty", () => {
        for (const empty of [null, undefined, []] as const) {
            const cards = seedWorkspaceHeaderCalculations(empty);
            expect(cards.length).toBeGreaterThan(0);
            // Same VM shape/renderer path; labels come from the calculations registry.
            for (const card of cards) {
                expect(card.formattedValue).toBe("—");
                expect(card.status).toBe("unknown");
                const registryLabel = findOperationalCalculation(card.sourceKey)?.label;
                if (registryLabel) expect(card.label).toBe(registryLabel);
            }
        }
    });

    it("fallback VMs derive labels/drills per key (no hardcoded strings)", () => {
        const cards = fallbackWorkspaceHeaderCardVms(["ops.needs_attention_count", "comms.delivery_rate"]);
        expect(cards[0]).toMatchObject({
            label: findOperationalCalculation("ops.needs_attention_count")?.label,
            drillHref: "/workspace/work-unit/needs-attention",
        });
        // Exploratory-only calculation — honest null drill target.
        expect(cards[1]?.drillHref).toBeNull();
    });
});

describe("WS.HEADER_CALCULATIONS — warm-cache refinement (values settle in place)", () => {
    const base: WorkspaceHeaderCalculationCardVm[] = fallbackWorkspaceHeaderCardVms([
        "ops.needs_attention_count",
        "ops.work_overdue_count",
    ]);

    it("patches formattedValue/status in place — card set and order never change", () => {
        const resolved = {
            "ops.needs_attention_count": {
                metric_key: "ops.needs_attention_count",
                formatted_value: "4",
                kpi: { status: "healthy" },
            },
        } as unknown as ResolvedMetricMap;

        const next = refineWorkspaceHeaderCardVms(base, resolved);
        expect(next.map((c) => c.sourceKey)).toEqual(base.map((c) => c.sourceKey));
        expect(next[0]).toMatchObject({ formattedValue: "4", status: "healthy" });
        // Unresolved card untouched (stays "—"/unknown — never removed).
        expect(next[1]).toMatchObject({ formattedValue: "—", status: "unknown" });
        // Labels/chrome are not refined — only value + status.
        expect(next[0]?.label).toBe(base[0]?.label);
    });

    it("returns the same reference when nothing changed (state bail-out safe)", () => {
        expect(refineWorkspaceHeaderCardVms(base, {} as ResolvedMetricMap)).toBe(base);
    });

    it("exposes only governed OIP keys for refinement, deduped", () => {
        const cards = [...base, { ...base[0]! }, { ...base[0]!, sourceKey: "not.a.metric" }];
        expect(workspaceHeaderCalculationKeys(cards)).toEqual([
            "ops.needs_attention_count",
            "ops.work_overdue_count",
        ]);
    });
});

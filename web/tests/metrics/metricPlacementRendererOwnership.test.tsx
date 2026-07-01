/** @vitest-environment jsdom */

import { createRoot } from "react-dom/client";
import { act } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { MetricPlacementRenderItem } from "@/lib/metrics/platform/renderMetricPlacements";

// Controllable fetch mock — each call returns the next queued bundle.
const queuedBundles: Array<{ items: MetricPlacementRenderItem[] }> = [];
let pendingForever = false;

vi.mock("@/lib/metrics/platform/fetchMetricRender", () => ({
    fetchMetricRenderBundle: vi.fn(async () => {
        if (pendingForever) return new Promise(() => {}) as Promise<{ items: MetricPlacementRenderItem[] }>;
        return queuedBundles.shift() ?? { items: [] };
    }),
}));

import { MetricPlacementRenderer } from "@/components/admin/metrics/MetricPlacementRenderer";
import { clearMetricRenderBundleCache } from "@/lib/metrics/platform/metricRenderBundleCache";
import { ANALYTICS_V2_SNAPSHOTS_UPDATED } from "@/app/adminV2/settings/analytics/platformBuilderEvents";

function renderItem(id: string, formattedValue: string, hasSnapshot: boolean): MetricPlacementRenderItem {
    return {
        id,
        definition: { id: `def-${id}`, key: `k-${id}`, label: "Leads", unit: null, precision: null, target_config: null },
        visualization: { label: "Leads", visualization_type: "kpi_card", display_config: {}, style_config: {} },
        formattedValue,
        healthState: hasSnapshot ? "healthy" : "unknown",
        snapshot: hasSnapshot ? { value: 42 } : null,
        sparklinePoints: [],
        comparison: null,
        periodStart: null,
        periodEnd: null,
    } as unknown as MetricPlacementRenderItem;
}

let container: HTMLDivElement;
let root: ReturnType<typeof createRoot>;

beforeEach(() => {
    clearMetricRenderBundleCache();
    queuedBundles.length = 0;
    pendingForever = false;
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
});

afterEach(() => {
    act(() => root.unmount());
    container.remove();
});

describe("MetricPlacementRenderer single-owner / no-blank", () => {
    it("renders the loadingReserve (not empty) on a cold paint while the bundle is loading", async () => {
        pendingForever = true; // fetch never resolves → stays in loading state
        await act(async () => {
            root.render(
                <MetricPlacementRenderer
                    surface="workspace_header"
                    placementZone="primary_metrics"
                    loadingReserve={<div data-test-reserve="true">reserve</div>}
                />,
            );
        });
        expect(container.querySelector("[data-test-reserve]")).not.toBeNull();
    });

    it("does NOT blank a populated slot when a revalidate returns value-less items", async () => {
        // First resolve: value-bearing items.
        queuedBundles.push({ items: [renderItem("p1", "42", true)] });
        await act(async () => {
            root.render(
                <MetricPlacementRenderer
                    surface="workspace_header"
                    placementZone="primary_metrics"
                    loadingReserve={<div data-test-reserve="true">reserve</div>}
                />,
            );
        });
        expect(container.textContent).toContain("42");

        // Revalidate (snapshot-updated) resolves with value-less items — must be ignored.
        queuedBundles.push({ items: [renderItem("p1", "—", false)] });
        await act(async () => {
            window.dispatchEvent(new Event(ANALYTICS_V2_SNAPSHOTS_UPDATED));
        });
        expect(container.textContent).toContain("42");
        expect(container.querySelector("[data-test-reserve]")).toBeNull();
    });

    it("adopts fresh value-bearing items on revalidate (patch in place)", async () => {
        queuedBundles.push({ items: [renderItem("p1", "42", true)] });
        await act(async () => {
            root.render(<MetricPlacementRenderer surface="workspace_header" placementZone="primary_metrics" />);
        });
        expect(container.textContent).toContain("42");

        queuedBundles.push({ items: [renderItem("p1", "99", true)] });
        await act(async () => {
            window.dispatchEvent(new Event(ANALYTICS_V2_SNAPSHOTS_UPDATED));
        });
        expect(container.textContent).toContain("99");
    });
});

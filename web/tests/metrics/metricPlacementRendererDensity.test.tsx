/** @vitest-environment jsdom */

import { createRoot } from "react-dom/client";
import { act } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { MetricPlacementRenderItem } from "@/lib/metrics/platform/renderMetricPlacements";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const queuedBundles: Array<{ items: MetricPlacementRenderItem[] }> = [];

vi.mock("@/lib/metrics/platform/fetchMetricRender", () => ({
    fetchMetricRenderBundle: vi.fn(async () => queuedBundles.shift() ?? { items: [] }),
}));

import { MetricPlacementRenderer } from "@/components/admin/metrics/MetricPlacementRenderer";
import {
    clearMetricRenderBundleCache,
    writeMetricRenderBundleCache,
} from "@/lib/metrics/platform/metricRenderBundleCache";

function kpiItem(id: string): MetricPlacementRenderItem {
    return {
        id,
        definition: { id: `def-${id}`, key: `k-${id}`, label: "Leads", unit: null, precision: null, target_config: null },
        visualization: { label: "Leads", visualization_type: "kpi_card", display_config: {}, style_config: {} },
        formattedValue: "42",
        healthState: "healthy",
        snapshot: { value: 42 },
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
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
});

afterEach(() => {
    act(() => root.unmount());
    container.remove();
});

async function renderWithLayout(layout: "inline" | "row" | "grid") {
    const items = [kpiItem("p1")];
    // Seed the snapshot cache so the slot paints its final placement synchronously
    // (warm path), making the density assertion deterministic regardless of fetch timing.
    writeMetricRenderBundleCache(
        { surface: "workspace_header", surfaceKey: "default", placementZone: "primary_metrics", contextType: "org", contextId: null },
        items,
    );
    queuedBundles.push({ items });
    await act(async () => {
        root.render(<MetricPlacementRenderer surface="workspace_header" placementZone="primary_metrics" layout={layout} />);
    });
}

describe("MetricPlacementRenderer density-from-layout", () => {
    it("renders compact cards for header/tile strips (inline)", async () => {
        await renderWithLayout("inline");
        const card = container.querySelector("[data-metric-card-shell]");
        expect(card?.getAttribute("data-metric-density")).toBe("compact");
    });

    it("renders compact cards for row strips (work-unit header)", async () => {
        await renderWithLayout("row");
        const card = container.querySelector("[data-metric-card-shell]");
        expect(card?.getAttribute("data-metric-density")).toBe("compact");
    });

    it("renders standard cards for dashboard grids", async () => {
        await renderWithLayout("grid");
        const card = container.querySelector("[data-metric-card-shell]");
        expect(card?.getAttribute("data-metric-density")).toBe("standard");
    });
});

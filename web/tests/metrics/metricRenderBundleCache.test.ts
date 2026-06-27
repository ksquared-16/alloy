import { afterEach, describe, expect, it } from "vitest";

import {
    clearMetricRenderBundleCache,
    metricRenderItemsHaveValues,
    readMetricRenderBundleCache,
    writeMetricRenderBundleCache,
} from "@/lib/metrics/platform/metricRenderBundleCache";
import type { MetricPlacementRenderItem } from "@/lib/metrics/platform/renderMetricPlacements";

function item(id: string): MetricPlacementRenderItem {
    return { id, snapshot: { value: 1 } } as unknown as MetricPlacementRenderItem;
}

function valueLessItem(id: string): MetricPlacementRenderItem {
    return { id, snapshot: null } as unknown as MetricPlacementRenderItem;
}

afterEach(() => clearMetricRenderBundleCache());

describe("metricRenderBundleCache", () => {
    it("cold read returns null so the renderer shows its reserve fallback (no late object before snapshot)", () => {
        expect(
            readMetricRenderBundleCache({ surface: "workspace_header", placementZone: "primary_metrics" }),
        ).toBeNull();
    });

    it("warm read returns the snapshot so the slot paints its final placement immediately", () => {
        const key = { surface: "workspace_header", placementZone: "primary_metrics", contextType: "org" };
        writeMetricRenderBundleCache(key, [item("m1"), item("m2")]);
        const seeded = readMetricRenderBundleCache(key);
        expect(seeded?.map((i) => i.id)).toEqual(["m1", "m2"]);
    });

    it("isolates snapshots by surface / zone / context (no cross-slot or cross-context leak)", () => {
        writeMetricRenderBundleCache(
            { surface: "work_unit_header", placementZone: "header_metrics", contextType: "work_unit", contextId: "wu-1" },
            [item("a")],
        );
        // Different context id → distinct slot.
        expect(
            readMetricRenderBundleCache({
                surface: "work_unit_header",
                placementZone: "header_metrics",
                contextType: "work_unit",
                contextId: "wu-2",
            }),
        ).toBeNull();
        // Different zone → distinct slot.
        expect(
            readMetricRenderBundleCache({
                surface: "work_unit_header",
                placementZone: "tile_metrics",
                contextType: "work_unit",
                contextId: "wu-1",
            }),
        ).toBeNull();
        // Same key → snapshot present.
        expect(
            readMetricRenderBundleCache({
                surface: "work_unit_header",
                placementZone: "header_metrics",
                contextType: "work_unit",
                contextId: "wu-1",
            })?.map((i) => i.id),
        ).toEqual(["a"]);
    });

    it("metricRenderItemsHaveValues distinguishes value-bearing from value-less/empty bundles", () => {
        expect(metricRenderItemsHaveValues([item("a"), item("b")])).toBe(true);
        // Mixed: at least one snapshot present → value-bearing.
        expect(metricRenderItemsHaveValues([valueLessItem("a"), item("b")])).toBe(true);
        // All snapshot-less → not value-bearing (must never replace a populated slot).
        expect(metricRenderItemsHaveValues([valueLessItem("a"), valueLessItem("b")])).toBe(false);
        expect(metricRenderItemsHaveValues([])).toBe(false);
        expect(metricRenderItemsHaveValues(null)).toBe(false);
        expect(metricRenderItemsHaveValues(undefined)).toBe(false);
    });

    it("default key fields (surfaceKey/contextType) normalize so omitted-vs-explicit defaults match", () => {
        writeMetricRenderBundleCache({ surface: "workspace_header", placementZone: "secondary_metrics" }, [item("z")]);
        expect(
            readMetricRenderBundleCache({
                surface: "workspace_header",
                surfaceKey: "default",
                placementZone: "secondary_metrics",
                contextType: "org",
                contextId: null,
            })?.map((i) => i.id),
        ).toEqual(["z"]);
    });
});

import { describe, expect, it } from "vitest";

import {
    inferLoaderAlignment,
    snapshotRect,
} from "@/lib/bos/bosDrawerGeometryReport";
import { DRAWER_OVERVIEW_DASHBOARD_MIN_WIDTH_PX } from "@/lib/layout/runtime/drawerOverviewCompositionStandard";

describe("bosDrawerGeometryReport", () => {
    it("snapshotRect rounds pixel values", () => {
        const el = {
            getBoundingClientRect: () =>
                ({
                    left: 10.4,
                    right: 110.6,
                    top: 0,
                    bottom: 50,
                    width: 100.2,
                    height: 50,
                }) as DOMRect,
        };
        expect(snapshotRect(el as unknown as Element)).toEqual({
            left: 10,
            right: 111,
            top: 0,
            bottom: 50,
            width: 100,
            height: 50,
            centerX: 61,
            centerY: 25,
        });
    });

    it("infers viewport-centered loader alignment", () => {
        expect(inferLoaderAlignment(800, 800, 600, 550)).toBe("viewport");
        expect(inferLoaderAlignment(600, 800, 598, 550)).toBe("drawer-panel");
        expect(inferLoaderAlignment(550, 800, 600, 548)).toBe("drawer-workspace");
        expect(inferLoaderAlignment(null, 800, 600, 550)).toBe("none");
    });

    it("documents drawer overview dashboard threshold for diagnostics parity", () => {
        expect(DRAWER_OVERVIEW_DASHBOARD_MIN_WIDTH_PX).toBe(1040);
    });
});

// inferLoaderAlignment is not exported - I need to fix the test or export it

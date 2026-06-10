import { describe, expect, it, vi } from "vitest";

import {
    BOS_RAIL_OVERLAY_GUTTER_PX,
    computeBosDrawerRailOffsetPx,
} from "@/lib/bos/bosOverlayGeometry";

describe("bosOverlayGeometry", () => {
    it("reserves overlay width plus gutter from viewport right", () => {
        vi.stubGlobal("window", { innerWidth: 1400 });
        const rect = {
            left: 1080,
            right: 1380,
            width: 300,
            top: 0,
            bottom: 0,
            x: 1080,
            y: 0,
            toJSON: () => ({}),
        } as DOMRect;

        const offset = computeBosDrawerRailOffsetPx(rect, BOS_RAIL_OVERLAY_GUTTER_PX);
        expect(offset).toBe(1400 - 1080 + BOS_RAIL_OVERLAY_GUTTER_PX);
    });
});

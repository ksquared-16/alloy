import { describe, expect, it } from "vitest";

import {
    BOS_FLOAT_DEFAULT_HEIGHT_PX,
    BOS_FLOAT_DEFAULT_WIDTH_PX,
    BOS_FLOAT_MIN_HEIGHT_PX,
    BOS_FLOAT_MIN_WIDTH_PX,
    clampBosFloatingGeometry,
    defaultBosFloatingGeometry,
    maxBosFloatingHeightPx,
    maxBosFloatingWidthPx,
} from "@/lib/bos/bosFloatingGeometry";

describe("bosFloatingGeometry", () => {
    const canvas = { width: 1440, height: 900 };

    it("defaults to lower-right within safe margins", () => {
        const geo = defaultBosFloatingGeometry(canvas);
        expect(geo.width).toBe(BOS_FLOAT_DEFAULT_WIDTH_PX);
        expect(geo.height).toBe(BOS_FLOAT_DEFAULT_HEIGHT_PX);
        expect(geo.x + geo.width).toBeLessThanOrEqual(canvas.width - 8);
        expect(geo.y).toBeGreaterThanOrEqual(56);
        expect(geo.y + geo.height).toBeLessThanOrEqual(canvas.height);
    });

    it("clamps below minimum size up to min bounds", () => {
        const geo = clampBosFloatingGeometry(
            { x: 0, y: 0, width: 100, height: 100 },
            canvas,
        );
        expect(geo.width).toBe(BOS_FLOAT_MIN_WIDTH_PX);
        expect(geo.height).toBe(BOS_FLOAT_MIN_HEIGHT_PX);
        expect(geo.x).toBeGreaterThanOrEqual(24);
        expect(geo.y).toBeGreaterThanOrEqual(56 + 24);
    });

    it("clamps oversized panels to max canvas fractions", () => {
        const geo = clampBosFloatingGeometry(
            { x: -200, y: -200, width: 2000, height: 2000 },
            canvas,
        );
        expect(geo.width).toBe(maxBosFloatingWidthPx(canvas.width));
        expect(geo.height).toBe(maxBosFloatingHeightPx(canvas.height));
        expect(geo.x + geo.width).toBeLessThanOrEqual(canvas.width);
        expect(geo.y + geo.height).toBeLessThanOrEqual(canvas.height);
    });

    it("keeps preferred geometry inside a smaller viewport without inventing a new default", () => {
        const preferred = defaultBosFloatingGeometry({ width: 1600, height: 1000 });
        const corrected = clampBosFloatingGeometry(preferred, { width: 1280, height: 800 });
        expect(corrected.width).toBeLessThanOrEqual(maxBosFloatingWidthPx(1280));
        expect(corrected.height).toBeLessThanOrEqual(maxBosFloatingHeightPx(800));
        expect(corrected.x).toBeGreaterThanOrEqual(24);
    });
});

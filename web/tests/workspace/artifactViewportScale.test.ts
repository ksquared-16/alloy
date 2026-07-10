/** @vitest-environment node */

import { describe, expect, it } from "vitest";

import {
    ARTIFACT_PAGE_CARD_CHROME,
    computeFitPageScale,
    computeFitWidthScale,
    estimateArtifactPageHeight,
    resolveArtifactScale,
} from "@/lib/workspace/artifactViewportScale";

describe("artifactViewportScale", () => {
    const letterPage = { width: 612, height: 792 };

    it("estimateArtifactPageHeight uses aspect ratio plus card chrome", () => {
        const h = estimateArtifactPageHeight(400, letterPage);
        expect(h).toBeGreaterThan(ARTIFACT_PAGE_CARD_CHROME + 400);
        expect(h).toBeCloseTo(ARTIFACT_PAGE_CARD_CHROME + 400 * (792 / 612), 0);
    });

    it("fit-page uses both width and height constraints", () => {
        const contentW = 400;
        const firstPageH = estimateArtifactPageHeight(contentW, letterPage);
        const scale = computeFitPageScale({
            viewportW: 420,
            viewportH: 320,
            contentW,
            firstPageH,
        });
        expect(scale).toBeLessThan(1);
        expect(firstPageH * scale).toBeLessThanOrEqual(320 - 16 + 1);
    });

    it("fit-page never returns 1 when portrait page cannot fit height", () => {
        const contentW = 500;
        const firstPageH = estimateArtifactPageHeight(contentW, letterPage);
        const scale = computeFitPageScale({
            viewportW: 520,
            viewportH: 280,
            contentW,
            firstPageH,
        });
        expect(scale).toBeLessThan(0.85);
    });

    it("fit-width scales to viewport width only", () => {
        const scale = computeFitWidthScale({ viewportW: 420, contentW: 400 });
        expect(scale).toBeCloseTo((420 - 16) / 400, 2);
    });

    it("resolveArtifactScale respects manual mode", () => {
        const scale = resolveArtifactScale({
            mode: "manual",
            viewportW: 500,
            viewportH: 400,
            contentW: 400,
            firstPageH: 600,
            manualScale: 1.25,
        });
        expect(scale).toBe(1.25);
    });
});

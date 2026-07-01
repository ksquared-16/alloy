import { describe, expect, it } from "vitest";

import {
    computeOperationalWorkspaceBounds,
    OPERATIONAL_WORKSPACE_LEFT_CLEARANCE_PX,
} from "@/lib/bos/operationalWorkspaceGeometry";

const GUTTER = 16;

describe("computeOperationalWorkspaceBounds", () => {
    it("fills the full band from sidebar to BOS rail (no centering)", () => {
        const bounds = computeOperationalWorkspaceBounds({
            sidebarRight: 280,
            bosRailLeft: 1600,
            viewportWidth: 1920,
        });
        expect(bounds.left).toBe(280 + OPERATIONAL_WORKSPACE_LEFT_CLEARANCE_PX);
        expect(bounds.right).toBe(1600 - GUTTER);
        expect(bounds.width).toBe(bounds.right - bounds.left);
    });

    it("is never capped at 1280px on a wide band", () => {
        const bounds = computeOperationalWorkspaceBounds({
            sidebarRight: 80,
            bosRailLeft: 2480,
            viewportWidth: 2560,
        });
        expect(bounds.width).toBeGreaterThan(1280);
    });

    it("anchors left to the sidebar regardless of band width (never horizontally centered)", () => {
        const narrow = computeOperationalWorkspaceBounds({
            sidebarRight: 280,
            bosRailLeft: 900,
            viewportWidth: 1280,
        });
        const wide = computeOperationalWorkspaceBounds({
            sidebarRight: 280,
            bosRailLeft: 1800,
            viewportWidth: 1920,
        });
        // Centering would shift `left` rightward as the band grows; the operational band must not.
        expect(narrow.left).toBe(wide.left);
        expect(narrow.left).toBe(280 + OPERATIONAL_WORKSPACE_LEFT_CLEARANCE_PX);
    });

    it("falls back to the viewport right edge when the BOS rail is unmeasured", () => {
        const bounds = computeOperationalWorkspaceBounds({
            sidebarRight: 280,
            bosRailLeft: null,
            viewportWidth: 1440,
        });
        expect(bounds.right).toBe(1440 - GUTTER);
        expect(bounds.left).toBe(280 + OPERATIONAL_WORKSPACE_LEFT_CLEARANCE_PX);
    });

    it("honors explicit gutter and clearance overrides", () => {
        const bounds = computeOperationalWorkspaceBounds({
            sidebarRight: 200,
            bosRailLeft: 1700,
            viewportWidth: 1920,
            gutterPx: 24,
            leftClearancePx: 8,
        });
        expect(bounds.left).toBe(208);
        expect(bounds.right).toBe(1676);
    });

    it("never produces a negative width", () => {
        const bounds = computeOperationalWorkspaceBounds({
            sidebarRight: 1000,
            bosRailLeft: 1010,
            viewportWidth: 1100,
        });
        expect(bounds.width).toBeGreaterThanOrEqual(0);
    });
});

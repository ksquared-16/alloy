import { describe, expect, it } from "vitest";

import {
    computeDrawerWorkspaceBounds,
    DRAWER_WORKSPACE_LEFT_CLEARANCE_PX,
    DRAWER_WORKSPACE_MAX_WIDTH_PX,
    DRAWER_WORKSPACE_MIN_USABLE_WIDTH_PX,
    BOS_MIN_USABLE_WIDTH_PX,
    passesDrawerWorkspaceGutterRules,
} from "@/lib/bos/drawerWorkspaceGeometry";

describe("drawerWorkspaceGeometry", () => {
    it("centers drawer in V3 band (sidebar+16 → bos−24)", () => {
        const bounds = computeDrawerWorkspaceBounds({
            sidebarRight: 280,
            bosOverlayLeft: 1200,
            bosOverlayWidth: 349,
            bosOverlayRight: 1549,
            viewportWidth: 1600,
            gutterPx: 24,
        });

        expect(bounds.backdropLeft).toBe(280);
        expect(bounds.availableLeft).toBe(280 + DRAWER_WORKSPACE_LEFT_CLEARANCE_PX);
        expect(bounds.availableRight).toBe(1176);
        expect(bounds.availableWidth).toBe(880);
        expect(bounds.computedDrawerWidth).toBe(880);
        expect(bounds.computedDrawerLeft).toBeGreaterThanOrEqual(280 + DRAWER_WORKSPACE_LEFT_CLEARANCE_PX);
        expect(bounds.computedDrawerRight).toBeLessThanOrEqual(1176);

        const rules = passesDrawerWorkspaceGutterRules(bounds, {
            left: bounds.computedDrawerLeft,
            right: bounds.computedDrawerRight,
        });
        expect(rules.passesLeft).toBe(true);
        expect(rules.passesRight).toBe(true);
    });

    it("drawerWidth = min(960, availableWidth)", () => {
        const bounds = computeDrawerWorkspaceBounds({
            sidebarRight: 56,
            bosOverlayLeft: 1100,
            bosOverlayWidth: 320,
            bosOverlayRight: 1420,
            viewportWidth: 1600,
            gutterPx: 24,
        });

        expect(bounds.computedDrawerWidth).toBe(
            Math.min(DRAWER_WORKSPACE_MAX_WIDTH_PX, bounds.availableWidth)
        );
    });

    it("shrinks BOS when drawer would fall below minimum usable width", () => {
        const bounds = computeDrawerWorkspaceBounds({
            sidebarRight: 280,
            bosOverlayLeft: 900,
            bosOverlayWidth: 400,
            bosOverlayRight: 1300,
            viewportWidth: 1600,
            gutterPx: 24,
        });

        expect(bounds.effectiveBosOverlayLeft).toBeGreaterThan(bounds.bosOverlayLeft!);
        expect(bounds.effectiveBosOverlayWidth!).toBeLessThan(400);
        expect(bounds.effectiveBosOverlayWidth!).toBeGreaterThanOrEqual(BOS_MIN_USABLE_WIDTH_PX);
        expect(bounds.computedDrawerWidth).toBeGreaterThanOrEqual(
            Math.min(DRAWER_WORKSPACE_MIN_USABLE_WIDTH_PX, bounds.availableWidth)
        );
    });

    it("shrinks drawer width when band is narrower than preferred", () => {
        const bounds = computeDrawerWorkspaceBounds({
            sidebarRight: 280,
            bosOverlayLeft: 700,
            bosOverlayWidth: 280,
            bosOverlayRight: 980,
            viewportWidth: 1600,
            gutterPx: 24,
        });

        expect(bounds.computedDrawerWidth).toBeLessThan(DRAWER_WORKSPACE_MAX_WIDTH_PX);
        expect(bounds.computedDrawerRight).toBeLessThanOrEqual(676);
    });
});

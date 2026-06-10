import { describe, expect, it } from "vitest";

import {
    computeDrawerWorkspaceBounds,
    DRAWER_WORKSPACE_INNER_PADDING_PX,
    DRAWER_WORKSPACE_LEFT_CLEARANCE_PX,
    DRAWER_WORKSPACE_MAX_WIDTH_PX,
    passesDrawerWorkspaceGutterRules,
} from "@/lib/bos/drawerWorkspaceGeometry";

describe("drawerWorkspaceGeometry", () => {
    it("centers drawer inside sidebar-to-BOS band with clearance", () => {
        const bounds = computeDrawerWorkspaceBounds({
            sidebarRight: 280,
            bosOverlayLeft: 1200,
            viewportWidth: 1600,
            gutterPx: 24,
        });

        expect(bounds.availableLeft).toBe(280);
        expect(bounds.availableRight).toBe(1176);
        expect(bounds.availableWidth).toBe(896);
        expect(bounds.computedDrawerWidth).toBe(
            Math.min(DRAWER_WORKSPACE_MAX_WIDTH_PX, 896 - DRAWER_WORKSPACE_INNER_PADDING_PX)
        );
        expect(bounds.computedDrawerLeft).toBeGreaterThanOrEqual(280 + DRAWER_WORKSPACE_LEFT_CLEARANCE_PX);
        expect(bounds.computedDrawerRight).toBeLessThanOrEqual(1176);

        const rules = passesDrawerWorkspaceGutterRules(bounds, {
            left: bounds.computedDrawerLeft,
            right: bounds.computedDrawerRight,
        });
        expect(rules.passesLeft).toBe(true);
        expect(rules.passesRight).toBe(true);
    });

    it("shrinks drawer width when band is narrow", () => {
        const bounds = computeDrawerWorkspaceBounds({
            sidebarRight: 280,
            bosOverlayLeft: 700,
            viewportWidth: 1600,
            gutterPx: 24,
        });

        expect(bounds.computedDrawerWidth).toBeLessThan(DRAWER_WORKSPACE_MAX_WIDTH_PX);
        expect(bounds.computedDrawerRight).toBeLessThanOrEqual(676);
    });
});

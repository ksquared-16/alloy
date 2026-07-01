import { describe, expect, it } from "vitest";

import { BOS_RAIL_OVERLAY_GUTTER_PX } from "@/lib/bos/bosOverlayGeometry";
import {
    computeDrawerWorkspaceBounds,
    DRAWER_WORKSPACE_LEFT_CLEARANCE_PX,
    DRAWER_WORKSPACE_MAX_WIDTH_PX,
    DRAWER_WORKSPACE_MIN_USABLE_WIDTH_PX,
    DRAWER_WORKSPACE_OUTER_MARGIN_PX,
    BOS_MIN_USABLE_WIDTH_PX,
    passesDrawerWorkspaceGutterRules,
} from "@/lib/bos/drawerWorkspaceGeometry";

describe("drawerWorkspaceGeometry", () => {
    it("centers drawer in V3 band with outer modal margin", () => {
        const bounds = computeDrawerWorkspaceBounds({
            sidebarRight: 280,
            bosOverlayLeft: 1300,
            bosOverlayWidth: 349,
            bosOverlayRight: 1649,
            viewportWidth: 1600,
            gutterPx: BOS_RAIL_OVERLAY_GUTTER_PX,
        });

        const innerWidth = bounds.availableWidth - 2 * DRAWER_WORKSPACE_OUTER_MARGIN_PX;

        expect(bounds.backdropLeft).toBe(280);
        expect(bounds.availableLeft).toBe(280 + DRAWER_WORKSPACE_LEFT_CLEARANCE_PX);
        expect(bounds.availableRight).toBe(1300 - BOS_RAIL_OVERLAY_GUTTER_PX);
        expect(bounds.computedDrawerWidth).toBe(innerWidth);
        expect(bounds.computedDrawerLeft).toBeGreaterThanOrEqual(
            bounds.availableLeft + DRAWER_WORKSPACE_OUTER_MARGIN_PX
        );
        expect(bounds.computedDrawerRight).toBeLessThanOrEqual(
            bounds.availableRight - DRAWER_WORKSPACE_OUTER_MARGIN_PX
        );
        expect(bounds.computedBackdropRight).toBe(
            bounds.computedDrawerRight + DRAWER_WORKSPACE_OUTER_MARGIN_PX
        );

        const rules = passesDrawerWorkspaceGutterRules(bounds, {
            left: bounds.computedDrawerLeft,
            right: bounds.computedDrawerRight,
        });
        expect(rules.passesLeft).toBe(true);
        expect(rules.passesRight).toBe(true);
    });

    it("drawerWidth uses inner band (availableWidth − 2×outer margin)", () => {
        const bounds = computeDrawerWorkspaceBounds({
            sidebarRight: 56,
            bosOverlayLeft: 1100,
            bosOverlayWidth: 320,
            bosOverlayRight: 1420,
            viewportWidth: 1600,
            gutterPx: BOS_RAIL_OVERLAY_GUTTER_PX,
        });

        const innerWidth = bounds.availableWidth - 2 * DRAWER_WORKSPACE_OUTER_MARGIN_PX;

        expect(bounds.computedDrawerWidth).toBe(
            Math.min(DRAWER_WORKSPACE_MAX_WIDTH_PX, innerWidth)
        );
        expect(bounds.computedDrawerWidth).toBe(innerWidth);
    });

    it("live new-leads route uses modal framing with 16px BOS gutter", () => {
        const bounds = computeDrawerWorkspaceBounds({
            sidebarRight: 56,
            bosOverlayLeft: 1225,
            bosOverlayWidth: 345,
            bosOverlayRight: 1570,
            viewportWidth: 1600,
            gutterPx: BOS_RAIL_OVERLAY_GUTTER_PX,
        });

        const innerWidth = 1137 - 2 * DRAWER_WORKSPACE_OUTER_MARGIN_PX;

        expect(bounds.availableWidth).toBe(1137);
        expect(bounds.computedDrawerWidth).toBe(innerWidth);
        expect(bounds.computedDrawerLeft).toBe(72 + DRAWER_WORKSPACE_OUTER_MARGIN_PX);
        expect(bounds.computedDrawerRight).toBe(bounds.availableRight - DRAWER_WORKSPACE_OUTER_MARGIN_PX);
        expect(bounds.computedBackdropRight).toBe(bounds.computedDrawerRight + DRAWER_WORKSPACE_OUTER_MARGIN_PX);

        const rules = passesDrawerWorkspaceGutterRules(bounds, {
            left: bounds.computedDrawerLeft,
            right: bounds.computedDrawerRight,
        });
        expect(rules.passesLeft).toBe(true);
        expect(rules.passesRight).toBe(true);
    });

    it("shrinks BOS when drawer would fall below minimum usable width", () => {
        const bounds = computeDrawerWorkspaceBounds({
            sidebarRight: 280,
            bosOverlayLeft: 900,
            bosOverlayWidth: 400,
            bosOverlayRight: 1300,
            viewportWidth: 1600,
            gutterPx: BOS_RAIL_OVERLAY_GUTTER_PX,
        });

        expect(bounds.effectiveBosOverlayLeft).toBeGreaterThan(bounds.bosOverlayLeft!);
        expect(bounds.effectiveBosOverlayWidth!).toBeLessThan(400);
        expect(bounds.effectiveBosOverlayWidth!).toBeGreaterThanOrEqual(BOS_MIN_USABLE_WIDTH_PX);
        const maxInnerWidth = bounds.availableWidth - 2 * DRAWER_WORKSPACE_OUTER_MARGIN_PX;
        expect(bounds.computedDrawerWidth).toBeGreaterThanOrEqual(
            Math.min(DRAWER_WORKSPACE_MIN_USABLE_WIDTH_PX, maxInnerWidth)
        );
    });

    it("shrinks drawer width when band is narrower than preferred", () => {
        const bounds = computeDrawerWorkspaceBounds({
            sidebarRight: 280,
            bosOverlayLeft: 700,
            bosOverlayWidth: 280,
            bosOverlayRight: 980,
            viewportWidth: 1600,
            gutterPx: BOS_RAIL_OVERLAY_GUTTER_PX,
        });

        expect(bounds.computedDrawerWidth).toBeLessThan(DRAWER_WORKSPACE_MAX_WIDTH_PX);
        expect(bounds.computedDrawerRight).toBeLessThanOrEqual(
            700 - BOS_RAIL_OVERLAY_GUTTER_PX - DRAWER_WORKSPACE_OUTER_MARGIN_PX
        );
    });
});

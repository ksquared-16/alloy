import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { describe, expect, it } from "vitest";

import { BOS_RAIL_OVERLAY_GUTTER_PX } from "@/lib/bos/bosOverlayGeometry";
import {
    ALLOY_OS_FOCUS_PANEL_MAX_WIDTH_PX,
    ALLOY_OS_QUEUE_COMPRESSED_WIDTH_PX,
} from "@/lib/adminV2/runtime/alloyOsRuntimeFlag";
import {
    computeAlloyOsFocusPanelBounds,
    DRAWER_WORKSPACE_LEFT_CLEARANCE_PX,
    isAlloyOsSplitGeometryActive,
} from "@/lib/bos/drawerWorkspaceGeometry";
import {
    shouldCloseAdminV2DrawerOnOutsideTarget,
    ADMINV2_DRAWER_OUTSIDE_CLICK_SPLIT_IGNORE_SELECTOR,
} from "@/lib/adminV2/drawerOutsideClick";

/** Minimal Element-like stub whose `closest` matches a fixed set of selectors. */
function targetMatching(...selectors: string[]): EventTarget {
    return {
        closest(selector: string) {
            return selectors.includes(selector) ? ({} as Element) : null;
        },
    } as unknown as EventTarget;
}

/**
 * Right edge of the compressed queue rail. Peer-region geometry (System 1.5) — the queue
 * fills its column with NO modal outer margin: sidebar + left clearance + queue width.
 */
function queueRightEdge(sidebarRight: number): number {
    return sidebarRight + DRAWER_WORKSPACE_LEFT_CLEARANCE_PX + ALLOY_OS_QUEUE_COMPRESSED_WIDTH_PX;
}

describe("computeAlloyOsFocusPanelBounds — Queue | Focus Panel | BOS", () => {
    const wide = {
        sidebarRight: 280,
        bosOverlayLeft: 1100,
        bosOverlayWidth: 320,
        bosOverlayRight: 1420,
        viewportWidth: 1440,
    };

    it("docks the panel to the right of the compressed queue (no overlap, peer column)", () => {
        const bounds = computeAlloyOsFocusPanelBounds(wide);
        // Peer geometry: panel starts exactly at queue right + one gutter (no outer margin).
        const expectedLeft =
            queueRightEdge(wide.sidebarRight) + BOS_RAIL_OVERLAY_GUTTER_PX;
        expect(bounds.computedDrawerLeft).toBe(expectedLeft);
        expect(ALLOY_OS_QUEUE_COMPRESSED_WIDTH_PX).toBe(440);
    });

    it("keeps the panel left of the BOS rail", () => {
        const bounds = computeAlloyOsFocusPanelBounds(wide);
        const bandRight = wide.bosOverlayLeft - BOS_RAIL_OVERLAY_GUTTER_PX;
        expect(bounds.computedDrawerRight).toBeLessThanOrEqual(bandRight);
    });

    it("never shrinks BOS (effective == natural)", () => {
        const bounds = computeAlloyOsFocusPanelBounds(wide);
        expect(bounds.effectiveBosOverlayLeft).toBe(wide.bosOverlayLeft);
        expect(bounds.effectiveBosOverlayWidth).toBe(wide.bosOverlayWidth);
    });

    it("absorbs the band on a wide layout — reaches at least the 720 target, no dead space (polish #1)", () => {
        const roomy = {
            sidebarRight: 280,
            bosOverlayLeft: 1560,
            bosOverlayWidth: 340,
            bosOverlayRight: 1900,
            viewportWidth: 1920,
        };
        const bounds = computeAlloyOsFocusPanelBounds(roomy);
        const bandRight = roomy.bosOverlayLeft - BOS_RAIL_OVERLAY_GUTTER_PX;
        // Stays docked left (adjacent to the queue)…
        expect(bounds.computedDrawerLeft).toBe(
            queueRightEdge(roomy.sidebarRight) + BOS_RAIL_OVERLAY_GUTTER_PX
        );
        // …and fills the band to the BOS gutter — NO dead space between panel and BOS.
        expect(bounds.computedDrawerRight).toBe(bandRight);
        // Where room exists, the panel reaches at least the comfortable target.
        expect(bounds.computedDrawerWidth).toBeGreaterThanOrEqual(ALLOY_OS_FOCUS_PANEL_MAX_WIDTH_PX);
        // BOS is never consumed.
        expect(bounds.effectiveBosOverlayLeft).toBe(roomy.bosOverlayLeft);
    });

    it("produces finite, non-overlapping-where-possible bounds on a narrow band", () => {
        const narrow = {
            sidebarRight: 280,
            bosOverlayLeft: 980,
            bosOverlayWidth: 300,
            bosOverlayRight: 1280,
            viewportWidth: 1280,
        };
        const bounds = computeAlloyOsFocusPanelBounds(narrow);
        expect(Number.isFinite(bounds.computedDrawerLeft)).toBe(true);
        expect(bounds.computedDrawerWidth).toBeGreaterThan(0);
        expect(bounds.effectiveBosOverlayLeft).toBe(narrow.bosOverlayLeft);
    });

    it("record swap keeps identical geometry bounds (no remeasure shift)", () => {
        // A record swap re-runs the same measurement (queue stays compressed, BOS unchanged),
        // so the panel bounds must be byte-identical — the panel never closes/reopens/resizes.
        const a = computeAlloyOsFocusPanelBounds(wide);
        const b = computeAlloyOsFocusPanelBounds(wide);
        expect(b).toEqual(a);
    });
});

describe("shouldCloseAdminV2DrawerOnOutsideTarget — split swap guard", () => {
    const queueTarget = targetMatching(ADMINV2_DRAWER_OUTSIDE_CLICK_SPLIT_IGNORE_SELECTOR);
    const contextBarTarget = targetMatching('[data-alloy-os-context-bar="true"]');
    const panelTarget = targetMatching('[data-adminv2-drawer="true"]');
    const canvasTarget = targetMatching();

    it("closes on a queue-row click when split is INACTIVE (legacy behavior)", () => {
        expect(shouldCloseAdminV2DrawerOnOutsideTarget(queueTarget)).toBe(true);
        expect(shouldCloseAdminV2DrawerOnOutsideTarget(queueTarget, { alloyOsSplitActive: false })).toBe(true);
    });

    it("does NOT close on a queue-row click when split is ACTIVE (swap in place)", () => {
        expect(shouldCloseAdminV2DrawerOnOutsideTarget(queueTarget, { alloyOsSplitActive: true })).toBe(false);
    });

    it("never closes when the target is inside the drawer panel", () => {
        expect(shouldCloseAdminV2DrawerOnOutsideTarget(panelTarget)).toBe(false);
        expect(shouldCloseAdminV2DrawerOnOutsideTarget(panelTarget, { alloyOsSplitActive: true })).toBe(false);
    });

    it("still closes on a true outside (canvas) click even when split is active", () => {
        expect(shouldCloseAdminV2DrawerOnOutsideTarget(canvasTarget, { alloyOsSplitActive: true })).toBe(true);
    });

    // Polish: clicking the Queue header (search / filter) must NOT dismiss the Focus Panel.
    it("does NOT close on a Queue header click when split is ACTIVE (filters keep split)", () => {
        const queueHeaderTarget = targetMatching('[data-alloy-os-queue-header="true"]');
        expect(
            shouldCloseAdminV2DrawerOnOutsideTarget(queueHeaderTarget, { alloyOsSplitActive: true })
        ).toBe(false);
    });

    it("does NOT close on a Work Unit Context bar click when split is ACTIVE", () => {
        expect(
            shouldCloseAdminV2DrawerOnOutsideTarget(contextBarTarget, { alloyOsSplitActive: true })
        ).toBe(false);
    });

    it("closes on a Work Unit Context bar click when split is INACTIVE (legacy behavior)", () => {
        expect(shouldCloseAdminV2DrawerOnOutsideTarget(contextBarTarget)).toBe(true);
    });
});

describe("Alloy OS split — geometry remeasure on State 2 activation", () => {
    const here = dirname(fileURLToPath(import.meta.url));
    const controllerSrc = readFileSync(
        resolve(here, "../../../app/adminV2/components/AlloyOsRuntimeSplitController.tsx"),
        "utf8",
    );
    const drawerSrc = readFileSync(resolve(here, "../../../components/admin/Drawer.tsx"), "utf8");

    it("re-measures drawer bounds when split toggles (prevents queue/panel overlap)", () => {
        expect(controllerSrc).toMatch(/useLayoutEffect\(\(\)\s*=>\s*\{[\s\S]*splitActive[\s\S]*measureAndApplyDrawerWorkspaceGeometry/);
    });

    it("Drawer mutation observer watches the split attribute", () => {
        expect(drawerSrc).toContain("ALLOY_OS_RUNTIME_SPLIT_ATTR");
        expect(drawerSrc).toMatch(/attributeFilter:[\s\S]*ALLOY_OS_RUNTIME_SPLIT_ATTR/);
    });
});

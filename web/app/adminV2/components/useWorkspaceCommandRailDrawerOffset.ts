"use client";

import { useLayoutEffect } from "react";

import {
    BOS_DRAWER_RAIL_OFFSET_CSS_VAR,
    BOS_OVERLAY_GUTTER_CSS_VAR,
    BOS_OVERLAY_WIDTH_CSS_VAR,
    BOS_RAIL_OVERLAY_GUTTER_PX,
    computeBosDrawerRailOffsetPx,
} from "@/lib/bos/bosOverlayGeometry";
import {
    DRAWER_AVAILABLE_LEFT_CSS_VAR,
    DRAWER_AVAILABLE_RIGHT_CSS_VAR,
    DRAWER_AVAILABLE_WIDTH_CSS_VAR,
    DRAWER_COMPUTED_LEFT_CSS_VAR,
    DRAWER_COMPUTED_RIGHT_CSS_VAR,
    DRAWER_COMPUTED_WIDTH_CSS_VAR,
    computeDrawerWorkspaceBounds,
} from "@/lib/bos/drawerWorkspaceGeometry";

const SIDEBAR_SELECTOR = "[data-adminv2-sidebar='true']";
const DRAWER_OPEN_SELECTOR = "[data-adminv2-drawer='true']";
const DRAWER_OPENING_OVERLAY_SELECTOR = "[data-opportunity-drawer-opening-overlay='true']";

function clearDrawerWorkspaceGeometryVars(root: HTMLElement) {
    root.style.removeProperty(DRAWER_AVAILABLE_LEFT_CSS_VAR);
    root.style.removeProperty(DRAWER_AVAILABLE_RIGHT_CSS_VAR);
    root.style.removeProperty(DRAWER_AVAILABLE_WIDTH_CSS_VAR);
    root.style.removeProperty(DRAWER_COMPUTED_LEFT_CSS_VAR);
    root.style.removeProperty(DRAWER_COMPUTED_WIDTH_CSS_VAR);
    root.style.removeProperty(DRAWER_COMPUTED_RIGHT_CSS_VAR);
}

function applyDrawerWorkspaceGeometryVars(
    root: HTMLElement,
    bounds: ReturnType<typeof computeDrawerWorkspaceBounds>
) {
    root.style.setProperty(DRAWER_AVAILABLE_LEFT_CSS_VAR, `${bounds.availableLeft}px`);
    root.style.setProperty(DRAWER_AVAILABLE_RIGHT_CSS_VAR, `${bounds.availableRight}px`);
    root.style.setProperty(DRAWER_AVAILABLE_WIDTH_CSS_VAR, `${bounds.availableWidth}px`);
    root.style.setProperty(DRAWER_COMPUTED_LEFT_CSS_VAR, `${bounds.computedDrawerLeft}px`);
    root.style.setProperty(DRAWER_COMPUTED_WIDTH_CSS_VAR, `${bounds.computedDrawerWidth}px`);
    root.style.setProperty(DRAWER_COMPUTED_RIGHT_CSS_VAR, `${bounds.computedDrawerRight}px`);
}

/**
 * Positions entity drawers inside the workspace-safe rectangle (sidebar → BOS gutter).
 * Sets BOS overlay + drawer geometry CSS variables on `<html>`.
 */
export function useWorkspaceCommandRailDrawerOffset(enabled: boolean, pathname: string) {
    useLayoutEffect(() => {
        if (!enabled) {
            const root = document.documentElement;
            root.style.removeProperty(BOS_DRAWER_RAIL_OFFSET_CSS_VAR);
            root.style.removeProperty(BOS_OVERLAY_WIDTH_CSS_VAR);
            root.style.removeProperty(BOS_OVERLAY_GUTTER_CSS_VAR);
            clearDrawerWorkspaceGeometryVars(root);
            return;
        }

        const measure = () => {
            const root = document.documentElement;
            const gutter = BOS_RAIL_OVERLAY_GUTTER_PX;
            const overlay = document.querySelector("[data-adminv2-bos-rail-overlay=\"true\"]");
            const col = document.querySelector("[data-adminv2-workspace-command-column]");
            const anchor = overlay ?? col;

            if (!anchor) {
                root.style.setProperty(BOS_DRAWER_RAIL_OFFSET_CSS_VAR, "0px");
                root.style.setProperty(BOS_OVERLAY_WIDTH_CSS_VAR, "0px");
                root.style.setProperty(BOS_OVERLAY_GUTTER_CSS_VAR, `${gutter}px`);
                clearDrawerWorkspaceGeometryVars(root);
                return;
            }

            const anchorRect = anchor.getBoundingClientRect();
            const width = Math.max(0, Math.round(anchorRect.width));
            const offset = computeBosDrawerRailOffsetPx(anchorRect, gutter);

            root.style.setProperty(BOS_OVERLAY_WIDTH_CSS_VAR, `${width}px`);
            root.style.setProperty(BOS_OVERLAY_GUTTER_CSS_VAR, `${gutter}px`);
            root.style.setProperty(BOS_DRAWER_RAIL_OFFSET_CSS_VAR, `${offset}px`);

            const drawerOpen =
                document.querySelector(DRAWER_OPEN_SELECTOR) != null ||
                document.querySelector(DRAWER_OPENING_OVERLAY_SELECTOR) != null;
            if (!drawerOpen) {
                clearDrawerWorkspaceGeometryVars(root);
                return;
            }

            const sidebar = document.querySelector(SIDEBAR_SELECTOR);
            const sidebarRight =
                sidebar ? Math.round(sidebar.getBoundingClientRect().right) : 0;
            const bosOverlayLeft =
                overlay && overlay.getBoundingClientRect().width > 0 ?
                    Math.round(overlay.getBoundingClientRect().left)
                :   null;

            const bounds = computeDrawerWorkspaceBounds({
                sidebarRight,
                bosOverlayLeft,
                viewportWidth: window.innerWidth,
                gutterPx: gutter,
            });
            applyDrawerWorkspaceGeometryVars(root, bounds);
        };

        measure();

        const overlay = document.querySelector("[data-adminv2-bos-rail-overlay=\"true\"]");
        const col = document.querySelector("[data-adminv2-workspace-command-column]");
        const sidebar = document.querySelector(SIDEBAR_SELECTOR);
        const ro = typeof ResizeObserver !== "undefined" ? new ResizeObserver(measure) : null;
        if (overlay && ro) {
            ro.observe(overlay);
        }
        if (col && ro) {
            ro.observe(col);
        }
        if (sidebar && ro) {
            ro.observe(sidebar);
        }

        const scrollSurface = document.querySelector(".adminv2-workspace-scroll-surface");
        const onScroll = () => measure();
        scrollSurface?.addEventListener("scroll", onScroll, { passive: true });

        const mo =
            typeof MutationObserver !== "undefined" ?
                new MutationObserver(measure)
            :   null;
        if (mo) {
            mo.observe(document.body, {
                subtree: true,
                childList: true,
                attributes: true,
                attributeFilter: [
                    "data-adminv2-drawer",
                    "data-adminv2-bos-rail-overlay",
                    "data-adminv2-sidebar-collapsed",
                    "class",
                    "style",
                ],
            });
        }

        window.addEventListener("resize", measure);
        const t0 = window.setTimeout(measure, 0);
        const t1 = window.setTimeout(measure, 100);
        const t2 = window.setTimeout(measure, 300);
        const t3 = window.setTimeout(measure, 600);

        return () => {
            window.clearTimeout(t0);
            window.clearTimeout(t1);
            window.clearTimeout(t2);
            window.clearTimeout(t3);
            window.removeEventListener("resize", measure);
            scrollSurface?.removeEventListener("scroll", onScroll);
            if (ro) {
                ro.disconnect();
            }
            if (mo) {
                mo.disconnect();
            }
            const root = document.documentElement;
            root.style.removeProperty(BOS_DRAWER_RAIL_OFFSET_CSS_VAR);
            root.style.removeProperty(BOS_OVERLAY_WIDTH_CSS_VAR);
            root.style.removeProperty(BOS_OVERLAY_GUTTER_CSS_VAR);
            clearDrawerWorkspaceGeometryVars(root);
        };
    }, [enabled, pathname]);
}

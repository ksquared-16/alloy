"use client";

import { useLayoutEffect } from "react";

import {
    BOS_DRAWER_RAIL_OFFSET_CSS_VAR,
    BOS_OVERLAY_GUTTER_CSS_VAR,
    BOS_OVERLAY_WIDTH_CSS_VAR,
    BOS_RAIL_OVERLAY_GUTTER_PX,
    computeBosDrawerRailOffsetPx,
} from "@/lib/bos/bosOverlayGeometry";
import { isActionWorkspaceOpen } from "@/lib/bos/bosRailPresentationFlags";
import {
    clearDrawerWorkspaceGeometryVars,
    isDrawerGeometryProbeActive,
    measureAndApplyDrawerWorkspaceGeometry,
} from "@/lib/bos/drawerWorkspaceGeometry";

const BOS_OVERLAY_SELECTOR = "[data-adminv2-bos-rail-overlay=\"true\"]";
const COMMAND_COLUMN_SELECTOR = "[data-adminv2-workspace-command-column], [data-adminv2-persistent-command-rail=\"true\"]";
const SIDEBAR_SELECTOR = "[data-adminv2-sidebar=\"true\"]";

/**
 * Positions entity drawers inside the workspace-safe rectangle (sidebar → BOS gutter).
 * Sets BOS overlay + drawer geometry CSS variables on `<html>`.
 */
export function useWorkspaceCommandRailDrawerOffset(pathname: string) {
    useLayoutEffect(() => {
        const measure = () => {
            const root = document.documentElement;
            if (isDrawerGeometryProbeActive(root)) {
                return;
            }
            if (isActionWorkspaceOpen()) {
                return;
            }
            const gutter = BOS_RAIL_OVERLAY_GUTTER_PX;
            const overlay = document.querySelector(BOS_OVERLAY_SELECTOR);
            const col = document.querySelector(COMMAND_COLUMN_SELECTOR);
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

            measureAndApplyDrawerWorkspaceGeometry(root);
        };

        measure();

        const overlay = document.querySelector(BOS_OVERLAY_SELECTOR);
        const col = document.querySelector(COMMAND_COLUMN_SELECTOR);
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
                    "data-opportunity-drawer-opening-overlay",
                    "data-adminv2-action-workspace-open",
                    "data-adminv2-bos-rail-overlay-drawer",
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
    }, [pathname]);
}

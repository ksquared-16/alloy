"use client";

import { useLayoutEffect } from "react";

import {
    BOS_DRAWER_RAIL_OFFSET_CSS_VAR,
    BOS_OVERLAY_GUTTER_CSS_VAR,
    BOS_OVERLAY_WIDTH_CSS_VAR,
    BOS_RAIL_OVERLAY_GUTTER_PX,
    computeBosDrawerRailOffsetPx,
} from "@/lib/bos/bosOverlayGeometry";

/**
 * Positions entity drawers to stop before the BOS rail overlay + gutter.
 * Sets overlay width / gutter / drawer offset CSS variables on `<html>`.
 */
export function useWorkspaceCommandRailDrawerOffset(enabled: boolean, pathname: string) {
    useLayoutEffect(() => {
        if (!enabled) {
            document.documentElement.style.removeProperty(BOS_DRAWER_RAIL_OFFSET_CSS_VAR);
            document.documentElement.style.removeProperty(BOS_OVERLAY_WIDTH_CSS_VAR);
            document.documentElement.style.removeProperty(BOS_OVERLAY_GUTTER_CSS_VAR);
            return;
        }

        const measure = () => {
            const overlay = document.querySelector("[data-adminv2-bos-rail-overlay=\"true\"]");
            const col = document.querySelector("[data-adminv2-workspace-command-column]");
            const anchor = overlay ?? col;
            if (!anchor) {
                document.documentElement.style.setProperty(BOS_DRAWER_RAIL_OFFSET_CSS_VAR, "0px");
                document.documentElement.style.setProperty(BOS_OVERLAY_WIDTH_CSS_VAR, "0px");
                document.documentElement.style.setProperty(
                    BOS_OVERLAY_GUTTER_CSS_VAR,
                    `${BOS_RAIL_OVERLAY_GUTTER_PX}px`
                );
                return;
            }

            const rect = anchor.getBoundingClientRect();
            const width = Math.max(0, Math.round(rect.width));
            const gutter = BOS_RAIL_OVERLAY_GUTTER_PX;
            const offset = computeBosDrawerRailOffsetPx(rect, gutter);

            document.documentElement.style.setProperty(BOS_OVERLAY_WIDTH_CSS_VAR, `${width}px`);
            document.documentElement.style.setProperty(BOS_OVERLAY_GUTTER_CSS_VAR, `${gutter}px`);
            document.documentElement.style.setProperty(BOS_DRAWER_RAIL_OFFSET_CSS_VAR, `${offset}px`);
        };

        measure();

        const overlay = document.querySelector("[data-adminv2-bos-rail-overlay=\"true\"]");
        const col = document.querySelector("[data-adminv2-workspace-command-column]");
        const ro = typeof ResizeObserver !== "undefined" ? new ResizeObserver(measure) : null;
        if (overlay && ro) {
            ro.observe(overlay);
        }
        if (col && ro) {
            ro.observe(col);
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
                attributeFilter: ["data-adminv2-drawer", "data-adminv2-bos-rail-overlay", "class", "style"],
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
            document.documentElement.style.removeProperty(BOS_DRAWER_RAIL_OFFSET_CSS_VAR);
            document.documentElement.style.removeProperty(BOS_OVERLAY_WIDTH_CSS_VAR);
            document.documentElement.style.removeProperty(BOS_OVERLAY_GUTTER_CSS_VAR);
        };
    }, [enabled, pathname]);
}

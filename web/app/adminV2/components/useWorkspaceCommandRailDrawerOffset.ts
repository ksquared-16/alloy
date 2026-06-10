"use client";

import { useEffect } from "react";

/**
 * Positions entity drawers to stop before the workspace Actions command column.
 * Sets `--adminv2-workspace-command-rail-offset` on `<html>`.
 */
export function useWorkspaceCommandRailDrawerOffset(enabled: boolean, pathname: string) {
    useEffect(() => {
        if (!enabled) {
            document.documentElement.style.removeProperty("--adminv2-workspace-command-rail-offset");
            return;
        }

        const measure = () => {
            const col = document.querySelector("[data-adminv2-workspace-command-column]");
            if (!col) {
                document.documentElement.style.setProperty("--adminv2-workspace-command-rail-offset", "0px");
                return;
            }
            const rect = col.getBoundingClientRect();
            const offset = Math.max(0, Math.round(window.innerWidth - rect.left));
            document.documentElement.style.setProperty(
                "--adminv2-workspace-command-rail-offset",
                `${offset}px`
            );
        };

        measure();

        const col = document.querySelector("[data-adminv2-workspace-command-column]");
        const ro = typeof ResizeObserver !== "undefined" ? new ResizeObserver(measure) : null;
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
                attributes: true,
                attributeFilter: ["data-adminv2-drawer", "class", "style"],
            });
        }

        window.addEventListener("resize", measure);
        const t0 = window.setTimeout(measure, 0);
        const t1 = window.setTimeout(measure, 150);
        const t2 = window.setTimeout(measure, 400);

        return () => {
            window.clearTimeout(t0);
            window.clearTimeout(t1);
            window.clearTimeout(t2);
            window.removeEventListener("resize", measure);
            scrollSurface?.removeEventListener("scroll", onScroll);
            if (ro) {
                ro.disconnect();
            }
            if (mo) {
                mo.disconnect();
            }
            document.documentElement.style.removeProperty("--adminv2-workspace-command-rail-offset");
        };
    }, [enabled, pathname]);
}

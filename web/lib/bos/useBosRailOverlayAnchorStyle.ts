"use client";

import { useLayoutEffect, useState, type CSSProperties } from "react";

import { measureBosRailOverlayAnchorStyle } from "@/lib/bos/bosRailOverlayAnchor";

const HIDDEN_STYLE: CSSProperties = { visibility: "hidden", position: "fixed", pointerEvents: "none" };

/** Keeps the portaled BOS rail overlay aligned with the in-layout anchor host. */
export function useBosRailOverlayAnchorStyle(anchorEl: HTMLElement | null, enabled: boolean): CSSProperties {
    const [style, setStyle] = useState<CSSProperties>(HIDDEN_STYLE);

    useLayoutEffect(() => {
        if (!enabled || !anchorEl) {
            setStyle(HIDDEN_STYLE);
            return;
        }

        const update = () => {
            setStyle(measureBosRailOverlayAnchorStyle(anchorEl));
        };

        update();

        const ro = typeof ResizeObserver !== "undefined" ? new ResizeObserver(update) : null;
        if (ro) {
            ro.observe(anchorEl);
            const column = anchorEl.closest("[data-adminv2-workspace-command-column]");
            if (column instanceof HTMLElement) {
                ro.observe(column);
            }
        }

        const scrollSurface = document.querySelector(".adminv2-workspace-scroll-surface");
        scrollSurface?.addEventListener("scroll", update, { passive: true });
        window.addEventListener("resize", update);

        const mo =
            typeof MutationObserver !== "undefined" ?
                new MutationObserver(update)
            :   null;
        if (mo) {
            mo.observe(document.body, {
                subtree: true,
                attributes: true,
                attributeFilter: ["class", "style", "data-adminv2-drawer"],
                childList: true,
            });
        }

        const t0 = window.setTimeout(update, 0);
        const t1 = window.setTimeout(update, 150);

        return () => {
            window.clearTimeout(t0);
            window.clearTimeout(t1);
            scrollSurface?.removeEventListener("scroll", update);
            window.removeEventListener("resize", update);
            if (ro) {
                ro.disconnect();
            }
            if (mo) {
                mo.disconnect();
            }
            setStyle(HIDDEN_STYLE);
        };
    }, [anchorEl, enabled]);

    return style;
}

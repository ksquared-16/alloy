"use client";

import { useLayoutEffect, useState, type CSSProperties } from "react";

import { measureBosRailOverlayAnchorStyle } from "@/lib/bos/bosRailOverlayAnchor";

const HIDDEN_STYLE: CSSProperties = { visibility: "hidden", position: "fixed", pointerEvents: "none" };

function bosRailOverlayStylesEqual(a: CSSProperties, b: CSSProperties): boolean {
    return (
        a.visibility === b.visibility &&
        a.position === b.position &&
        a.pointerEvents === b.pointerEvents &&
        a.top === b.top &&
        a.right === b.right &&
        a.width === b.width &&
        a.maxWidth === b.maxWidth &&
        a.bottom === b.bottom &&
        a.display === b.display &&
        a.flexDirection === b.flexDirection &&
        a.minHeight === b.minHeight
    );
}

/** Keeps the portaled BOS rail overlay aligned with the in-layout anchor host. */
export function useBosRailOverlayAnchorStyle(anchorEl: HTMLElement | null, enabled: boolean): CSSProperties {
    const [style, setStyle] = useState<CSSProperties>(HIDDEN_STYLE);

    useLayoutEffect(() => {
        if (!enabled || !anchorEl) {
            setStyle((prev) => (bosRailOverlayStylesEqual(prev, HIDDEN_STYLE) ? prev : HIDDEN_STYLE));
            return;
        }

        const update = () => {
            const next = measureBosRailOverlayAnchorStyle(anchorEl);
            setStyle((prev) => (bosRailOverlayStylesEqual(prev, next) ? prev : next));
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
            setStyle((prev) => (bosRailOverlayStylesEqual(prev, HIDDEN_STYLE) ? prev : HIDDEN_STYLE));
        };
    }, [anchorEl, enabled]);

    return style;
}

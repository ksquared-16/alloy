"use client";

import { useEffect } from "react";

/**
 * Marks `<html>` when an AdminV2 entity drawer is open — BOS overlay styling / diagnostics.
 *
 * Important: do not observe `childList` on `document.body`. Create Lead Form (and other BOS
 * surfaces) mutate the DOM heavily while open; a body-wide childList observer starves the
 * main thread and can leave the Work Unit Focus Panel stuck on Thinking / Preparing until
 * BOS closes.
 */
export function useBosRailOverlayDrawerDocumentFlag(enabled: boolean) {
    useEffect(() => {
        if (!enabled) {
            return;
        }

        let raf = 0;
        const syncNow = () => {
            raf = 0;
            const drawerOpen =
                document.querySelector("[data-adminv2-drawer=\"true\"]") != null ||
                document.querySelector("[data-opportunity-drawer-opening-overlay=\"true\"]") != null;
            if (drawerOpen) {
                document.documentElement.setAttribute("data-adminv2-bos-rail-overlay-drawer", "true");
            } else {
                document.documentElement.removeAttribute("data-adminv2-bos-rail-overlay-drawer");
            }
        };
        const sync = () => {
            if (raf) return;
            raf = window.requestAnimationFrame(syncNow);
        };

        syncNow();
        const mo = new MutationObserver(sync);
        // Attribute-only: drawer open markers are attributes, not structural inserts.
        mo.observe(document.body, {
            subtree: true,
            attributes: true,
            attributeFilter: ["data-adminv2-drawer", "data-opportunity-drawer-opening-overlay"],
            childList: false,
        });

        return () => {
            mo.disconnect();
            if (raf) window.cancelAnimationFrame(raf);
            document.documentElement.removeAttribute("data-adminv2-bos-rail-overlay-drawer");
        };
    }, [enabled]);
}

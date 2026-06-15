"use client";

import { useEffect } from "react";

/** Marks `<html>` when an AdminV2 entity drawer is open — BOS overlay styling / diagnostics. */
export function useBosRailOverlayDrawerDocumentFlag(enabled: boolean) {
    useEffect(() => {
        if (!enabled) {
            return;
        }

        const sync = () => {
            const drawerOpen =
                document.querySelector("[data-adminv2-drawer=\"true\"]") != null ||
                document.querySelector("[data-opportunity-drawer-opening-overlay=\"true\"]") != null;
            if (drawerOpen) {
                document.documentElement.setAttribute("data-adminv2-bos-rail-overlay-drawer", "true");
            } else {
                document.documentElement.removeAttribute("data-adminv2-bos-rail-overlay-drawer");
            }
        };

        sync();
        const mo = new MutationObserver(sync);
        mo.observe(document.body, {
            subtree: true,
            attributes: true,
            attributeFilter: ["data-adminv2-drawer", "data-opportunity-drawer-opening-overlay"],
            childList: true,
        });

        return () => {
            mo.disconnect();
            document.documentElement.removeAttribute("data-adminv2-bos-rail-overlay-drawer");
        };
    }, [enabled]);
}

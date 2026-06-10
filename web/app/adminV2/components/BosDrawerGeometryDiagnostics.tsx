"use client";

import { useEffect } from "react";

import {
    BOS_DRAWER_GEOMETRY_AUTO_REPORT_KEY,
    collectBosDrawerGeometryReport,
    registerBosDrawerGeometryDiagnostics,
} from "@/lib/bos/bosDrawerGeometryReport";
import { isBosRightRailCopilotEnabledClient } from "@/lib/bos/bosRightRailCopilotFlag";

/**
 * Dev diagnostics — registers `window.__alloyReportBosDrawerGeometry()` for runtime drawer/BOS geometry.
 * No layout changes; measurement only.
 */
export default function BosDrawerGeometryDiagnostics() {
    const enabled = isBosRightRailCopilotEnabledClient();

    useEffect(() => {
        if (!enabled) return;
        registerBosDrawerGeometryDiagnostics();
    }, [enabled]);

    useEffect(() => {
        if (!enabled) return;
        if (typeof window === "undefined") return;
        if (window.localStorage.getItem(BOS_DRAWER_GEOMETRY_AUTO_REPORT_KEY) !== "1") return;

        let debounceTimer: number | undefined;
        const schedule = () => {
            window.clearTimeout(debounceTimer);
            debounceTimer = window.setTimeout(() => {
                collectBosDrawerGeometryReport({ log: true });
            }, 400);
        };

        const mo = new MutationObserver(schedule);
        mo.observe(document.body, {
            subtree: true,
            childList: true,
            attributes: true,
            attributeFilter: ["data-adminv2-drawer", "data-adminv2-bos-rail-overlay", "style", "class"],
        });

        window.addEventListener("resize", schedule);
        schedule();

        return () => {
            window.clearTimeout(debounceTimer);
            mo.disconnect();
            window.removeEventListener("resize", schedule);
        };
    }, [enabled]);

    return null;
}
